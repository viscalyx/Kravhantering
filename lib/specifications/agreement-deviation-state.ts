/** SQL expressions over fixed internal aliases, evaluated at the agreement's frozen result. */
export function agreementDeviationStateSql(kind: 'library' | 'local') {
  const item = kind === 'library' ? 'specification_item' : 'local_requirement'
  const cutoff = `${item}.followup_frozen_at`
  const caseColumn = kind === 'library' ? 'deviation_id' : 'local_deviation_id'
  const decisionRecorded = `(${cutoff} IS NULL OR deviation.decided_at <= ${cutoff})`
  return {
    visible: `(${cutoff} IS NULL OR deviation.created_at <= ${cutoff})`,
    pending: `(deviation.decision IS NULL OR deviation.decided_at > ${cutoff})`,
    approved: `(deviation.decision = 1 AND ${decisionRecorded} AND NOT EXISTS
      (SELECT 1 FROM specification_deviation_endings ending WHERE ending.${caseColumn} = deviation.id
        AND ending.ended_at IS NOT NULL AND (${cutoff} IS NULL OR ending.ended_at <= ${cutoff})))`,
    rejected: `(deviation.decision = 2 AND ${decisionRecorded})`,
  }
}
