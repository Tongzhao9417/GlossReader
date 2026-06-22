// English noun inflection for "gloss all occurrences".
//
// Intentionally NOUN-ONLY: glossing a word also marks its singular/plural
// counterpart, but never verb or adjective inflections (-ing / -ed / -er /
// -est). We have no part-of-speech information, so generation is deliberately
// conservative — it is fine to produce a string that does not exist (whole-word
// search simply finds nothing), but we avoid rules that could turn a noun into a
// real but unrelated word (e.g. belief -> "believes"). Ambiguous -f/-fe -> -ves
// cases are therefore handled only through the curated irregular table below.

// Singular -> plural. The reverse direction is derived automatically.
const IRREGULAR_PLURALS: Record<string, string> = {
  // Core English irregulars
  man: "men",
  woman: "women",
  child: "children",
  person: "people",
  foot: "feet",
  tooth: "teeth",
  goose: "geese",
  mouse: "mice",
  louse: "lice",
  ox: "oxen",
  // -f / -fe -> -ves (curated, since the regular rule is ambiguous)
  leaf: "leaves",
  life: "lives",
  knife: "knives",
  wife: "wives",
  self: "selves",
  shelf: "shelves",
  half: "halves",
  wolf: "wolves",
  calf: "calves",
  loaf: "loaves",
  thief: "thieves",
  // Latin / Greek forms common in academic writing
  datum: "data",
  medium: "media",
  analysis: "analyses",
  basis: "bases",
  crisis: "crises",
  thesis: "theses",
  hypothesis: "hypotheses",
  diagnosis: "diagnoses",
  prognosis: "prognoses",
  parenthesis: "parentheses",
  axis: "axes",
  phenomenon: "phenomena",
  criterion: "criteria",
  stimulus: "stimuli",
  radius: "radii",
  nucleus: "nuclei",
  focus: "foci",
  fungus: "fungi",
  cactus: "cacti",
  syllabus: "syllabi",
  alumnus: "alumni",
  curriculum: "curricula",
  bacterium: "bacteria",
  index: "indices",
  matrix: "matrices",
  vertex: "vertices",
  appendix: "appendices",
  formula: "formulae",
  larva: "larvae",
  vita: "vitae",
};

const IRREGULAR_SINGULARS: Record<string, string> = Object.fromEntries(
  Object.entries(IRREGULAR_PLURALS).map(([singular, plural]) => [
    plural,
    singular,
  ]),
);

// Nouns whose singular and plural are identical — return them untouched so we
// don't manufacture odd forms like "specie" or "fishes".
const INVARIANT = new Set([
  "species",
  "series",
  "means",
  "fish",
  "sheep",
  "deer",
  "aircraft",
  "offspring",
  "salmon",
  "data",
  "media",
]);

function regularPlural(word: string): string {
  if (/(s|ss|sh|ch|x|z)$/.test(word)) return `${word}es`;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

// Only meaningful when the word actually looks plural (see looksPlural).
function regularSingular(word: string): string {
  if (/ies$/.test(word)) return `${word.slice(0, -3)}y`;
  if (/sses$/.test(word)) return word.slice(0, -2); // classes -> class
  if (/(xes|zes|ches|shes)$/.test(word)) return word.slice(0, -2); // boxes -> box
  if (/s$/.test(word)) return word.slice(0, -1); // models -> model, cases -> case
  return word;
}

// Endings that are usually singular despite the trailing "s" — skip reverse
// (singularization) for these so we don't mangle bus/basis/famous/etc.
function looksPlural(word: string): boolean {
  return (
    word.length >= 3 &&
    /s$/.test(word) &&
    !/(ss|us|is|ous)$/.test(word)
  );
}

/**
 * Returns the set of word forms to search for when glossing `word`: the word
 * itself plus its singular/plural noun counterpart(s). Always lowercased; the
 * caller searches case-insensitively. Forms shorter than 2 characters are
 * dropped.
 */
export function getWordForms(word: string): string[] {
  const base = word.toLowerCase();
  const forms = new Set<string>([base]);

  if (!INVARIANT.has(base)) {
    if (IRREGULAR_PLURALS[base]) {
      forms.add(IRREGULAR_PLURALS[base]);
    } else if (IRREGULAR_SINGULARS[base]) {
      forms.add(IRREGULAR_SINGULARS[base]);
    } else if (looksPlural(base)) {
      forms.add(regularSingular(base)); // models -> model
    } else {
      forms.add(regularPlural(base)); // model -> models
    }
  }

  return [...forms].filter((form) => form.length >= 2);
}
