import { EntitySchema } from 'typeorm'
import type { RequirementsSpecificationItemEntity } from '@/lib/typeorm/entities/requirements-specification-item'
import type { SpecificationAgreementEntity } from '@/lib/typeorm/entities/specification-agreement'
import type { SpecificationItemStatusEntity } from '@/lib/typeorm/entities/specification-item-status'
import type { SpecificationLocalRequirementEntity } from '@/lib/typeorm/entities/specification-local-requirement'

export interface SpecificationAgreementItemEntity {
  changedInAgreement: SpecificationAgreementEntity | null
  changeKind: string | null
  deviationStateJson: string | null
  hasFollowupSnapshot: boolean
  id: number
  isRemoved: boolean
  needsReference: string | null
  note: string | null
  previousItem: SpecificationAgreementItemEntity | null
  specificationAgreement: SpecificationAgreementEntity
  specificationItem: RequirementsSpecificationItemEntity | null
  specificationItemStatus: SpecificationItemStatusEntity | null
  specificationLocalRequirement: SpecificationLocalRequirementEntity | null
  statusUpdatedAt: Date | null
}

export const specificationAgreementItemEntity =
  new EntitySchema<SpecificationAgreementItemEntity>({
    name: 'SpecificationAgreementItem',
    tableName: 'specification_agreement_items',
    columns: {
      deviationStateJson: {
        name: 'deviation_state_json',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      changeKind: {
        name: 'change_kind',
        type: 'varchar',
        length: 10,
        nullable: true,
      },
      id: { name: 'id', type: 'int', primary: true, generated: 'increment' },
      isRemoved: { name: 'is_removed', type: 'bit', default: false },
      hasFollowupSnapshot: {
        name: 'has_followup_snapshot',
        type: 'bit',
        default: false,
      },
      note: { name: 'note', type: 'nvarchar', nullable: true, length: 'MAX' },
      needsReference: {
        name: 'needs_reference',
        type: 'nvarchar',
        nullable: true,
        length: 'MAX',
      },
      statusUpdatedAt: {
        name: 'status_updated_at',
        type: 'datetime2',
        nullable: true,
      },
    },
    relations: {
      specificationAgreement: {
        type: 'many-to-one',
        target: 'SpecificationAgreement',
        nullable: false,
        onDelete: 'NO ACTION',
        joinColumn: {
          name: 'specification_agreement_id',
          foreignKeyConstraintName:
            'fk_specification_agreement_items_specification_agreement_id',
        },
      },
      specificationItem: {
        type: 'many-to-one',
        target: 'RequirementsSpecificationItem',
        nullable: true,
        onDelete: 'NO ACTION',
        joinColumn: {
          name: 'specification_item_id',
          foreignKeyConstraintName:
            'fk_specification_agreement_items_specification_item_id',
        },
      },
      specificationLocalRequirement: {
        type: 'many-to-one',
        target: 'SpecificationLocalRequirement',
        nullable: true,
        onDelete: 'NO ACTION',
        joinColumn: {
          name: 'specification_local_requirement_id',
          foreignKeyConstraintName:
            'fk_specification_agreement_items_specification_local_requirement_id',
        },
      },
      previousItem: {
        type: 'many-to-one',
        target: 'SpecificationAgreementItem',
        nullable: true,
        onDelete: 'NO ACTION',
        joinColumn: {
          name: 'previous_item_id',
          foreignKeyConstraintName:
            'fk_specification_agreement_items_previous_item_id',
        },
      },
      changedInAgreement: {
        type: 'many-to-one',
        target: 'SpecificationAgreement',
        nullable: true,
        onDelete: 'NO ACTION',
        joinColumn: {
          name: 'changed_in_agreement_id',
          foreignKeyConstraintName:
            'fk_specification_agreement_items_changed_in_agreement_id',
        },
      },
      specificationItemStatus: {
        type: 'many-to-one',
        target: 'SpecificationItemStatus',
        nullable: true,
        onDelete: 'NO ACTION',
        joinColumn: {
          name: 'specification_item_status_id',
          foreignKeyConstraintName:
            'fk_specification_agreement_items_specification_item_status_id',
        },
      },
    },
    indices: [
      {
        name: 'uq_specification_agreement_items_library',
        columns: ['specificationAgreement', 'specificationItem'],
        unique: true,
        where: '[specification_item_id] IS NOT NULL',
      },
      {
        name: 'uq_specification_agreement_items_local',
        columns: ['specificationAgreement', 'specificationLocalRequirement'],
        unique: true,
        where: '[specification_local_requirement_id] IS NOT NULL',
      },
    ],
    checks: [
      {
        name: 'chk_specification_agreement_items_change_kind',
        expression: "[change_kind] IN ('added', 'changed', 'removed')",
      },
      {
        name: 'chk_specification_agreement_items_binding',
        expression:
          '([specification_item_id] IS NOT NULL AND [specification_local_requirement_id] IS NULL) OR ([specification_item_id] IS NULL AND [specification_local_requirement_id] IS NOT NULL)',
      },
    ],
  })
