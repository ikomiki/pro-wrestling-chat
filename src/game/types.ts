export type Category = "throw" | "submission" | "strike" | "aerial";
export const CATEGORY_LABEL: Record<Category, string> = {
  throw: "投げ技",
  submission: "極め技",
  strike: "打撃技",
  aerial: "飛び技",
};

export type Grade = "normal" | "big" | "finisher";
export const GRADE_LABEL: Record<Grade, string> = {
  normal: "通常",
  big: "大技",
  finisher: "必殺技",
};

export type EnemyType = "giant" | "speed" | "muscle" | "technician";
export const ENEMY_TYPE_LABEL: Record<EnemyType, string> = {
  giant: "巨漢",
  speed: "スピード",
  muscle: "マッチョ",
  technician: "技巧派",
};
export const ENEMY_TYPE_TENDENCY: Record<EnemyType, Category> = {
  giant: "throw",
  speed: "aerial",
  muscle: "strike",
  technician: "submission",
};

export type Action = { name: string; category: Category | "none"; grade: Grade };
export type Fighter = { name: string; description: string; hp: number; maxHp: number };
export type Side = "player" | "enemy";
