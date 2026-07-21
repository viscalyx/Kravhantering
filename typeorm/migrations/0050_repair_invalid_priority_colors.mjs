const VALID_HEX_PATTERN =
  "N'#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'"

const UP_STATEMENTS = [
  `UPDATE [priority_levels]
    SET [color] = CASE [code]
      WHEN N'P1' THEN N'#6b7280'
      WHEN N'P2' THEN N'#22c55e'
      WHEN N'P3' THEN N'#eab308'
      WHEN N'P4' THEN N'#f97316'
      WHEN N'P5' THEN N'#ef4444'
      ELSE [color]
    END
    WHERE [code] IN (N'P1', N'P2', N'P3', N'P4', N'P5')
      AND (
        [color] IS NULL
        OR DATALENGTH([color]) <> 14
        OR [color] COLLATE Latin1_General_100_BIN2 NOT LIKE ${VALID_HEX_PATTERN}
      );`,
]

async function runStatements(queryRunner, statements) {
  for (const statement of statements) {
    await queryRunner.query(statement)
  }
}

export class RepairInvalidPriorityColors1719700000000 {
  name = 'RepairInvalidPriorityColors1719700000000'

  async up(queryRunner) {
    await runStatements(queryRunner, UP_STATEMENTS)
  }

  async down(queryRunner) {
    await queryRunner.query(
      `THROW 51019, 'Cannot restore invalid priority colors replaced by migration 0050.', 1;`,
    )
  }
}

export default RepairInvalidPriorityColors1719700000000
