# Jobs

**Responsibility:** Background/async processing infrastructure shared by Ocr,
Conversion, Compression, and future AI processing — job tracking, progress,
failure handling. This is the *architecture* module (queue plumbing), distinct
from the domain modules that define *what* a job does.

**Owns:** `document_jobs` table (`App\Models\DocumentJob`).

**Exposes (future):** A base queued-job class other modules extend, and a
progress-reporting contract the frontend polls or subscribes to.

**Phase 0 status:** Schema + model only. `QUEUE_CONNECTION=database` is
configured (Laravel's `jobs`/`failed_jobs` tables already migrated via the
framework's own migrations); no actual Job classes exist yet since no module has
processing logic to run. Redis is a documented drop-in upgrade for the queue
driver when throughput requires it.
