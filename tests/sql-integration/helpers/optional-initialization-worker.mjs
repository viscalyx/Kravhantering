import { DataSource } from 'typeorm'
import { main } from '../../../scripts/db-sqlserver-admin.mjs'

class InterruptedDataSource extends DataSource {
  createQueryRunner(...args) {
    const runner = super.createQueryRunner(...args)
    const query = runner.query.bind(runner)
    runner.query = async (...queryArgs) => {
      if (
        queryArgs[0].startsWith('UPDATE [optional_catalog_initializations]')
      ) {
        process.send('catalog-written')
        await new Promise(() => {})
      }
      return query(...queryArgs)
    }
    return runner
  }
}

process.exitCode = await main(['seed:optional', '--json'], {
  configureReadonlyAccess: false,
  ...(process.env.INTERRUPT_OPTIONAL_INITIALIZATION === '1'
    ? { dataSourceCtor: InterruptedDataSource }
    : {}),
})
