function unavailable(): never {
  throw new Error(
    'expo-sqlite is not available in this application. TypeORM must use the Microsoft SQL Server driver.',
  )
}

export const openDatabaseAsync = unavailable

export default {
  openDatabaseAsync,
}
