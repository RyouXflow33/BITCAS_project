<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/models/AdvisoryStore.php';
require_once dirname(__DIR__) . '/models/Auth.php';
require_once dirname(__DIR__) . '/models/InputRules.php';

final class AdvisoryController {
    public function handle(): void {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');

        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            // Only reading is open to other origins. Sending an advisory is never cross-site.
            header('Access-Control-Allow-Origin: *');
            header('Access-Control-Allow-Methods: GET, OPTIONS');
            http_response_code(204);
            return;
        }

        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            // The driver app reads this list without signing in.
            header('Access-Control-Allow-Origin: *');
            echo json_encode(advisory_read(), JSON_UNESCAPED_SLASHES);
            return;
        }

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(['ok' => false, 'error' => 'Use GET or POST']);
            return;
        }

        // Broadcasting reaches every driver phone, so only a signed-in desk account may do it.
        $signedIn = Auth::requireUser(true);

        $payload = json_decode((string)file_get_contents('php://input'), true);
        if (!is_array($payload)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'Expected JSON']);
            return;
        }

        try {
            $action = (string)($payload['action'] ?? '');
            if ($action === 'clear') {
                advisory_write([]);
                echo json_encode(['ok' => true, 'advisories' => []]);
                return;
            }

            if ($action !== 'broadcast') {
                http_response_code(400);
                echo json_encode(['ok' => false, 'error' => 'Unknown action']);
                return;
            }

            $level = trim((string)($payload['level'] ?? ''));
            $area = trim((string)($payload['area'] ?? ''));
            $message = trim((string)($payload['message'] ?? ''));
            if (!in_array($level, ['Low', 'Moderate', 'High'], true)) {
                http_response_code(400);
                echo json_encode(['ok' => false, 'error' => 'Level must be Low, Moderate, or High']);
                return;
            }
            try {
                $area = InputRules::shortText($area, 'Area', 80, true);
                $message = InputRules::note($message, 'Message', 280);
                if ($message === '') {
                    throw new InvalidArgumentException('Message is required.');
                }
            } catch (InvalidArgumentException $error) {
                http_response_code(422);
                echo json_encode(['ok' => false, 'error' => $error->getMessage()]);
                return;
            }

            // The author is the signed-in account, not whatever the request claims.
            $actor = (string)$signedIn['userId'];

            $sentAt = new DateTimeImmutable('now', new DateTimeZone('Asia/Manila'));
            $advisory = [
                'id' => 'ADV-' . (int)round(microtime(true) * 1000),
                'level' => $level,
                'area' => $area,
                'message' => $message,
                'sentAtIso' => $sentAt->format('c'),
                'channel' => 'OneSignal',
                'createdByUserId' => $actor !== '' ? $actor : null
            ];

            $list = advisory_read();
            array_unshift($list, $advisory);
            $list = array_slice($list, 0, 20);
            advisory_write($list);

            $this->reply([
                'ok' => true,
                'advisory' => $advisory,
                'push' => ['sent' => true, 'reason' => 'Sent to driver phones.']
            ]);

            try {
                $push = advisory_push($advisory);
                if (!$push['sent']) {
                    $stored = advisory_read();
                    foreach ($stored as $index => $item) {
                        if (($item['id'] ?? '') === $advisory['id']) {
                            $stored[$index]['channel'] = 'Saved in database';
                            advisory_write($stored);
                            break;
                        }
                    }
                }
            } catch (Throwable $pushError) {
                // The desk already received the saved advisory.
            }
        } catch (Throwable $error) {
            error_log('advisories: ' . $error->getMessage());
            http_response_code(500);
            echo json_encode(['ok' => false, 'error' => 'Server error. Try again.']);
        }
    }

    private function reply(array $payload): void {
        $json = json_encode($payload, JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            $json = '{"ok":false,"error":"Could not encode the response"}';
        }
        ignore_user_abort(true);
        header('Content-Encoding: none');
        header('Connection: close');
        header('Content-Length: ' . strlen($json));
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        echo $json;
        flush();
        if (function_exists('fastcgi_finish_request')) {
            fastcgi_finish_request();
        }
    }
}
