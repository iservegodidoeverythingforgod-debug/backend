import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillAndEnforceRuleItemStatusColor1724650000000
  implements MigrationInterface
{
  name = 'BackfillAndEnforceRuleItemStatusColor1724650000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const conditions = await queryRunner.query(`
      SELECT id, rules FROM "growth_conditions"
    `);

    for (const cond of conditions) {
      if (!cond.rules || !Array.isArray(cond.rules)) continue;

      let changed = false;
      const updatedRules = cond.rules.map((item: any) => {
        if (!item || typeof item !== 'object') return item;

        const output = item.output || {};
        let statusColor = output.statusColor;

        if (!statusColor || typeof statusColor !== 'string') {
          changed = true;
          if (item.isOptimal === true || item.severity === 'none') {
            statusColor = '#4CAF50';
          } else if (item.severity === 'high') {
            statusColor = '#F44336';
          } else if (item.severity === 'medium') {
            statusColor = '#FF9800';
          } else if (item.severity === 'low') {
            statusColor = '#FFC107';
          } else {
            statusColor = '#4CAF50';
          }
        }

        const animationAssetId = output.animationAssetId || item.animationAssetId;

        const updatedOutput: any = {
          rule: Array.isArray(output.rule) ? output.rule : (output.rule ? [output.rule] : []),
          to: output.to || 'Optimal condition',
          statusColor,
        };
        if (animationAssetId) {
          updatedOutput.animationAssetId = animationAssetId;
        }

        const newItem: any = {
          input: Array.isArray(item.input) ? item.input : [],
          output: updatedOutput,
        };

        if (item.isOptimal !== undefined || item.severity !== undefined) {
          changed = true;
        }

        return newItem;
      });

      if (changed) {
        await queryRunner.query(
          `UPDATE "growth_conditions" SET "rules" = $1 WHERE id = $2`,
          [JSON.stringify(updatedRules), cond.id],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Non-destructive down: statusColor remains in jsonb
  }
}
