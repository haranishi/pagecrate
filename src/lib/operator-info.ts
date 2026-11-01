/**
 * Who runs PageCrate and where people can reach them (requirements 6.2, 6.3). This is the only place to fill in.
 * The operator decides every value (2026-11-01: the business name and the contact address the operator's own site
 * already publishes). A field left null makes the pages show UNDECIDED_LABEL, and the release gate refuses to publish
 * while missingOperatorFields() is not empty.
 */
export interface OperatorInfo {
  /** 運営者の名称 */
  readonly name: string | null;
  /** 問い合わせ先 */
  readonly contact: string | null;
  /** 権利者の申し立て窓口 */
  readonly rightsContact: string | null;
}

export const OPERATOR_INFO: OperatorInfo = {
  name: "Lilac（ライラック・個人事業）",
  contact: "lilac.webstudio00@gmail.com",
  rightsContact: "lilac.webstudio00@gmail.com",
};

export const UNDECIDED_LABEL = "未確定（公開前に確定して掲載します）";

export const OPERATOR_FIELD_LABELS: Readonly<Record<keyof OperatorInfo, string>> = {
  name: "運営者の名称",
  contact: "問い合わせ先",
  rightsContact: "権利者の申し立て窓口",
};

const FIELDS = Object.keys(OPERATOR_FIELD_LABELS) as (keyof OperatorInfo)[];

function decided(value: string | null): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** The fields still undecided; a blank string counts as undecided. Empty means the operator section is complete. */
export function missingOperatorFields(info: OperatorInfo = OPERATOR_INFO): (keyof OperatorInfo)[] {
  return FIELDS.filter(field => !decided(info[field]));
}

/** The operator section as label and shown value, in a fixed order. */
export function operatorFacts(info: OperatorInfo = OPERATOR_INFO): { term: string; detail: string }[] {
  return FIELDS.map(field => {
    const value = info[field];
    return { term: OPERATOR_FIELD_LABELS[field], detail: decided(value) ? value.trim() : UNDECIDED_LABEL };
  });
}
