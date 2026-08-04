const VALID_HEX_PATTERN =
  "N'#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'"

const INVALID_COLOR_PREDICATE = `(
  [color] IS NULL
  OR DATALENGTH([color]) <> 14
  OR [color] COLLATE Latin1_General_100_BIN2 NOT LIKE ${VALID_HEX_PATTERN}
)`

const UP_STATEMENTS = [
  `UPDATE [requirement_statuses]
    SET [color] = CASE [id]
      WHEN 1 THEN N'#3b82f6'
      WHEN 2 THEN N'#eab308'
      WHEN 3 THEN N'#22c55e'
      WHEN 4 THEN N'#6b7280'
      ELSE [color]
    END
    WHERE [id] IN (1, 2, 3, 4)
      AND ${INVALID_COLOR_PREDICATE};`,
  `UPDATE [specification_item_statuses]
    SET [color] = CASE [id]
      WHEN 1 THEN N'#94a3b8'
      WHEN 2 THEN N'#f59e0b'
      WHEN 3 THEN N'#3b82f6'
      WHEN 4 THEN N'#22c55e'
      WHEN 5 THEN N'#ef4444'
      WHEN 6 THEN N'#6b7280'
      ELSE [color]
    END
    WHERE [id] IN (1, 2, 3, 4, 5, 6)
      AND ${INVALID_COLOR_PREDICATE};`,
]

async function runStatements(queryRunner, statements) {
  for (const statement of statements) {
    await queryRunner.query(statement)
  }
}

export class RepairInvalidStatusColors1720000000000 {
  name = 'RepairInvalidStatusColors1720000000000'

  async up(queryRunner) {
    await runStatements(queryRunner, UP_STATEMENTS)
  }

  async down(queryRunner) {
    await queryRunner.query(
      `THROW 51020, 'Cannot restore invalid status colors replaced by migration 0053.', 1;`,
    )
  }
}

export default RepairInvalidStatusColors1720000000000
