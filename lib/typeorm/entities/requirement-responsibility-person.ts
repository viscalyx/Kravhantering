import { EntitySchema } from 'typeorm'

export interface RequirementResponsibilityPersonEntity {
  createdAt: Date
  email: string | null
  givenName: string
  hsaId: string
  lastFetchedAt: Date | null
  middleName: string | null
  surname: string | null
  updatedAt: Date
}

export const requirementResponsibilityPersonEntity =
  new EntitySchema<RequirementResponsibilityPersonEntity>({
    name: 'RequirementResponsibilityPerson',
    tableName: 'requirement_responsibility_people',
    columns: {
      hsaId: {
        name: 'hsa_id',
        primary: true,
        type: 'nvarchar',
        length: 31,
      },
      givenName: {
        name: 'given_name',
        type: 'nvarchar',
        length: 'MAX',
      },
      middleName: {
        name: 'middle_name',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      surname: {
        name: 'surname',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      email: {
        name: 'email',
        type: 'nvarchar',
        length: 450,
        nullable: true,
      },
      lastFetchedAt: {
        name: 'last_fetched_at',
        type: 'datetime2',
        nullable: true,
      },
      createdAt: { name: 'created_at', type: 'datetime2' },
      updatedAt: { name: 'updated_at', type: 'datetime2' },
    },
  })
