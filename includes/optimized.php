<section class="page-head">
    <div><span class="section-kicker">INTELLIGENCE / OPTIMIZATION</span><p>Turn live telemetry into recommended traffic-control actions.</p></div>
    <div class="head-actions"><span class="tag success">MODEL ONLINE</span><button class="btn primary">Run optimization</button></div>
</section>
<div class="stats-grid">
    <div class="stat-card"><div class="stat-icon green">↗</div><div><span>Estimated delay saved</span><strong>18.4%</strong></div><small>vs. current routing</small></div>
    <div class="stat-card"><div class="stat-icon blue">⌁</div><div><span>Routes optimized</span><strong>27</strong></div><small>in the last 15 minutes</small></div>
    <div class="stat-card"><div class="stat-icon violet">◉</div><div><span>Signal plans</span><strong>08</strong></div><small>ready for approval</small></div>
    <div class="stat-card"><div class="stat-icon yellow">⚡</div><div><span>Confidence</span><strong>94%</strong></div><small>prediction confidence</small></div>
</div>
<div class="command-grid">
    <section class="panel map-panel"><div class="panel-head"><div><h2>Recommended traffic actions</h2><span>Predicted impact in 10 minutes</span></div><button class="chip active">Recommended</button></div><?php include __DIR__ . '/map.php'; ?></section>
    <section class="panel">
        <div class="panel-head"><div><h2>Optimization queue</h2><span>Awaiting operator approval</span></div></div>
        <div class="opt-item"><div class="opt-number">01</div><div><strong>Extend green phase</strong><p>Araneta–Lacson · +12 sec</p><small>Projected delay −8.2%</small></div><span class="tag success">HIGH IMPACT</span></div>
        <div class="opt-item"><div class="opt-number">02</div><div><strong>Divert northbound flow</strong><p>Lopez Jaena → Burgos</p><small>Projected delay −5.7%</small></div><span class="tag info">MEDIUM</span></div>
        <div class="opt-item"><div class="opt-number">03</div><div><strong>Deploy traffic unit</strong><p>Villamonte junction</p><small>Projected delay −4.1%</small></div><span class="tag warning">REVIEW</span></div>
    </section>
</div>
<div class="panel">
    <div class="panel-head"><div><h2>Decision preview</h2><span>Before / after simulation</span></div><button class="btn primary">Approve plan</button></div>
    <div class="before-after"><div><label>CURRENT</label><div class="mini-bars"><i style="width:82%"></i><i style="width:65%"></i><i style="width:91%"></i><i style="width:48%"></i></div></div><div class="arrow">→</div><div><label>OPTIMIZED</label><div class="mini-bars"><i style="width:64%"></i><i style="width:49%"></i><i style="width:70%"></i><i style="width:38%"></i></div></div></div>
</div>
