// Modules 3, 4, 6: failure detection, auto-recovery, incident management.
// check() and recover() are injected so the logic is easy to test.

const iso = () => new Date().toISOString();
const defaultLog = (level, msg) => console.log(`[${level}] ${msg}`);

class Monitor {
  constructor({
    db,
    check,
    recover,
    threshold = 3,
    verifyAttempts = 10,
    verifyDelayMs = 2000,
    log = defaultLog,
    sleep = ms => new Promise(r => setTimeout(r, ms))
  }) {
    Object.assign(this, {
      db,
      check,
      recover,
      threshold,
      verifyAttempts,
      verifyDelayMs,
      log,
      sleep
    });

    this.failures = 0;
    this.firstFailure = null;
    this.alert = null;
  }

  saveCheck(r) {
    this.db
      .prepare(
        'INSERT INTO health_checks (timestamp,status,status_code,response_time,error) VALUES (?,?,?,?,?)'
      )
      .run(
        r.timestamp,
        r.status,
        r.statusCode,
        r.responseTime,
        r.error
      );
  }

  openIncident() {
    return this.db
      .prepare(
        'SELECT * FROM incidents WHERE end_time IS NULL ORDER BY id DESC LIMIT 1'
      )
      .get();
  }

  closeIncident(inc, status) {
    const end = iso();

    const downtime = Math.round(
      (Date.parse(end) - Date.parse(inc.start_time)) / 1000
    );

    this.db
      .prepare(
        'UPDATE incidents SET end_time=?, downtime=?, recovery_status=? WHERE id=?'
      )
      .run(end, downtime, status, inc.id);
  }

  async tick() {
    const r = await this.check();

    this.saveCheck(r);

    if (r.status === 'healthy') {
      this.log(
        'INFO',
        `Status: HEALTHY, response time: ${r.responseTime} ms`
      );

      const open = this.openIncident();

      if (open) {
        this.closeIncident(open, 'Recovered');
        this.alert = 'recovered';
      }

      this.failures = 0;
      this.firstFailure = null;

      return r;
    }

    this.failures++;

    this.firstFailure =
      this.firstFailure || r.timestamp;

    this.log(
      'WARNING',
      `Health check failed (${r.error}). Consecutive failures: ${this.failures}`
    );

    if (this.failures >= this.threshold) {
      await this.recoverNow(r);
    }

    return r;
  }

  async recoverNow(lastCheck) {
    this.log(
      'WARNING',
      'Failure threshold reached. Recovery triggered'
    );

    this.alert = 'failure';

    let inc = this.openIncident();

    if (!inc) {
      const reason = lastCheck.statusCode
        ? `HTTP ${lastCheck.statusCode}`
        : 'Application Unavailable';

      const id = this.db
        .prepare(
          'INSERT INTO incidents (start_time,reason,recovery_action,recovery_status) VALUES (?,?,?,?)'
        )
        .run(
          this.firstFailure || iso(),
          reason,
          'Application Recovery',
          'IN PROGRESS'
        ).lastInsertRowid;

      inc = this.db
        .prepare(
          'SELECT * FROM incidents WHERE id=?'
        )
        .get(id);
    }

    let result = 'FAILED';

    try {
      this.log(
        'INFO',
        'Starting application recovery'
      );

      await this.recover();

      this.log(
        'INFO',
        'Application recovery requested. Waiting for health check'
      );

      for (
        let i = 0;
        i < this.verifyAttempts;
        i++
      ) {
        await this.sleep(this.verifyDelayMs);

        const r = await this.check();

        if (r.status === 'healthy') {
          this.saveCheck({
            ...r,
            error: 'Recovered'
          });

          this.log(
            'INFO',
            'Health check successful'
          );

          result = 'SUCCESS';
          break;
        }
      }
    } catch (e) {
      this.log(
        'ERROR',
        `Recovery error: ${e.message}`
      );
    }

    this.db
      .prepare(
        'INSERT INTO recovery_events (timestamp,action,result) VALUES (?,?,?)'
      )
      .run(
        iso(),
        'Application Recovery',
        result
      );

    if (result === 'SUCCESS') {
      this.closeIncident(
        inc,
        'Recovered'
      );

      this.alert = 'recovered';

      this.log(
        'INFO',
        'Recovery completed'
      );
    } else {
      this.db
        .prepare(
          'UPDATE incidents SET recovery_status=? WHERE id=?'
        )
        .run(
          'FAILED',
          inc.id
        );

      this.alert = 'failed';

      this.log(
        'ERROR',
        'Recovery FAILED. Incident remains active'
      );
    }

    this.failures = 0;
    this.firstFailure = null;

    return result;
  }

  metrics() {
    const one = sql =>
      this.db.prepare(sql).get();

    const total =
      one(
        'SELECT COUNT(*) n FROM health_checks'
      ).n;

    const failed =
      one(
        "SELECT COUNT(*) n FROM health_checks WHERE status='unhealthy'"
      ).n;

    const last =
      one(
        'SELECT * FROM health_checks ORDER BY id DESC LIMIT 1'
      ) || null;

    const avg =
      one(
        "SELECT AVG(response_time) a FROM (SELECT response_time FROM health_checks WHERE status='healthy' AND response_time IS NOT NULL ORDER BY id DESC LIMIT 100)"
      ).a;

    const first =
      one(
        'SELECT MIN(timestamp) t FROM health_checks'
      ).t;

    const recoveries =
      one(
        "SELECT COUNT(*) n FROM recovery_events WHERE result='SUCCESS'"
      ).n;

    const incidents =
      one(
        'SELECT COUNT(*) n FROM incidents'
      ).n;

    let down =
      one(
        'SELECT COALESCE(SUM(downtime),0) s FROM incidents WHERE end_time IS NOT NULL'
      ).s;

    const open = this.openIncident();

    if (open) {
      down +=
        (Date.now() -
          Date.parse(open.start_time)) /
        1000;
    }

    const totalSec = first
      ? (Date.now() -
          Date.parse(first)) /
        1000
      : 0;

    const uptime =
      totalSec > 0
        ? Math.max(
            0,
            ((totalSec - down) /
              totalSec) *
              100
          )
        : 100;

    return {
      status: last
        ? last.status
        : 'unknown',

      lastResponseTime: last
        ? last.response_time
        : null,

      avgResponseTime:
        avg == null
          ? null
          : Math.round(avg),

      uptime:
        Math.round(uptime * 100) /
        100,

      totalChecks: total,
      failedChecks: failed,
      recoveries,
      incidents,
      consecutiveFailures:
        this.failures,
      alert: this.alert
    };
  }

  recentChecks(n = 20) {
    return this.db
      .prepare(
        'SELECT * FROM health_checks ORDER BY id DESC LIMIT ?'
      )
      .all(n);
  }

  incidentList(n = 10) {
    return this.db
      .prepare(
        'SELECT * FROM incidents ORDER BY id DESC LIMIT ?'
      )
      .all(n)
      .map(i => ({
        ...i,
        incident_id:
          'INC' +
          String(i.id).padStart(3, '0')
      }));
  }
}

module.exports = { Monitor };