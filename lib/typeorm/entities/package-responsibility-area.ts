import { EntitySchema } from 'typeorm'

export interface PackageResponsibilityAreaEntity {
  id: number
  nameEn: string
  nameSv: string
}

export const packageResponsibilityAreaEntity =
  new EntitySchema<PackageResponsibilityAreaEntity>({
    name: 'PackageResponsibilityArea',
    tableName: 'package_responsibility_areas',
    columns: {
      id: {
        name: 'id',
        primary: true,
        type: 'int',
        generated: 'increment',
      },
      nameSv: { name: 'name_sv', type: 'nvarchar', length: 450 },
      nameEn: { name: 'name_en', type: 'nvarchar', length: 450 },
    },
    uniques: [
      { name: 'uq_package_responsibility_areas_name_en', columns: ['nameEn'] },
      { name: 'uq_package_responsibility_areas_name_sv', columns: ['nameSv'] },
    ],
  })
