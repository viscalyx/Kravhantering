import {
  buildRuntimePermissionReconcileSql,
  buildRuntimeRoleDropSql,
} from '../runtime-permission-manifest.mjs'

const UP_STATEMENTS = [buildRuntimePermissionReconcileSql()]
const DOWN_STATEMENTS = [buildRuntimeRoleDropSql()]

async function runStatements(queryRunner, statements) {
  for (const statement of statements) {
    await queryRunner.query(statement)
  }
}

export class RuntimeRole1720100000000 {
  name = 'RuntimeRole1720100000000'

  async up(queryRunner) {
    await runStatements(queryRunner, UP_STATEMENTS)
  }

  async down(queryRunner) {
    await runStatements(queryRunner, DOWN_STATEMENTS)
  }
}

export default RuntimeRole1720100000000
