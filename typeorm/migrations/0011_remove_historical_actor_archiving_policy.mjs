const UP_STATEMENTS = [
  `DELETE FROM [archiving_retention_policies]
    WHERE [policy_key] = N'historical_actor_archive';`,
]

// The historical_actor_archive policy is intentionally removed and should not
// be restored by rollback; actors are handled by the privacy-erasure workflow.
const DOWN_STATEMENTS = []

export class RemoveHistoricalActorArchivingPolicy1715500000000 {
  name = 'RemoveHistoricalActorArchivingPolicy1715500000000'

  async up(queryRunner) {
    for (const sql of UP_STATEMENTS) {
      try {
        await queryRunner.query(sql)
      } catch (err) {
        err.message = `${err.message}\n--- failing statement:\n${sql}`
        throw err
      }
    }
  }

  async down(queryRunner) {
    for (const sql of DOWN_STATEMENTS) {
      try {
        await queryRunner.query(sql)
      } catch (err) {
        err.message = `${err.message}\n--- failing statement:\n${sql}`
        throw err
      }
    }
  }
}

export default RemoveHistoricalActorArchivingPolicy1715500000000
