# Snapshots and incremental loads: explain-back

Answer in your own words, without notes. Commit when done.

1. Why can't a watermark-based incremental load see hard deletes, and what are two ways to handle them?
2. What makes a load job idempotent, and why does it matter for retries?
3. Why should the next watermark be max(updated_at) of the loaded rows and not the time the job finished?
4. A row arrives with updated_at older than your watermark. What happens, and how do you design for it?
5. Your SCD2 snapshot runs daily. Product asks how many users were on a trial plan for a few hours last
   Tuesday. What can you tell them?
