import type { Job, JobRole, JobSeeker } from '../types';

export interface SkillMatchResult {
  percentage: number;
  totalRequirements: number;
  matchedRequirements: string[];
  matchedSkills: string[];
}

const ROLE_LABELS: Record<JobRole, string> = {
  bartender: 'Bartender',
  server: 'Server',
  chef: 'Chef',
  sous_chef: 'Sous Chef',
  kitchen_porter: 'Kitchen Porter',
  event_manager: 'Event Manager',
  event_coordinator: 'Event Coordinator',
  front_of_house: 'Front of House',
  back_of_house: 'Back of House',
  runner: 'Runner',
  barista: 'Barista',
  sommelier: 'Sommelier',
  mixologist: 'Mixologist',
  catering_assistant: 'Catering Assistant',
  other: 'Other',
};

const ROLE_SKILL_FAMILIES: Partial<Record<JobRole, string[]>> = {
  bartender: ['bartender', 'bartending', 'mixology', 'mixologist', 'cocktail', 'cocktails', 'bar service'],
  server: ['server', 'waiter', 'waitress', 'table service', 'food service', 'guest service', 'customer service'],
  chef: ['chef', 'cook', 'cooking', 'food prep', 'food preparation', 'kitchen'],
  sous_chef: ['sous chef', 'chef', 'cook', 'cooking', 'food prep', 'kitchen'],
  kitchen_porter: ['kitchen porter', 'kp', 'washing up', 'dishwashing', 'dish washing', 'kitchen support'],
  event_manager: ['event manager', 'event management', 'event planning', 'coordination', 'team leadership'],
  event_coordinator: ['event coordinator', 'event planning', 'coordination'],
  front_of_house: ['front of house', 'foh', 'host', 'hosting', 'reception', 'customer service'],
  back_of_house: ['back of house', 'boh', 'kitchen', 'prep', 'food prep'],
  runner: ['runner', 'food runner', 'service runner'],
  barista: ['barista', 'coffee', 'espresso', 'latte art'],
  sommelier: ['sommelier', 'wine', 'wine service', 'wine knowledge'],
  mixologist: ['mixologist', 'mixology', 'cocktail', 'cocktails', 'bartender', 'bartending'],
  catering_assistant: ['catering assistant', 'catering', 'food service', 'food prep'],
};

const EDGE_WORDS = new Set([
  'ability',
  'able',
  'candidate',
  'experienced',
  'experience',
  'needed',
  'preferred',
  'professional',
  'required',
  'role',
  'staff',
  'team',
  'wanted',
]);

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value).split(' ').filter(Boolean);
}

function normalizePhrase(value: string): string {
  const tokens = tokenize(value);

  while (tokens.length > 0 && EDGE_WORDS.has(tokens[0])) {
    tokens.shift();
  }

  while (tokens.length > 0 && EDGE_WORDS.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }

  return tokens.join(' ');
}

function hasTokenSubsetMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;

  const aTokens = a.split(' ').filter(Boolean);
  const bTokens = b.split(' ').filter(Boolean);
  const [smaller, larger] =
    aTokens.length <= bTokens.length ? [aTokens, bTokens] : [bTokens, aTokens];

  if (smaller.length === 0) return false;
  if (smaller.length === 1 && smaller[0].length < 4) return false;

  const largerSet = new Set(larger);
  return smaller.every((token) => largerSet.has(token));
}

function familiesForPhrase(phrase: string): string[] {
  return Object.entries(ROLE_SKILL_FAMILIES)
    .filter(([, aliases]) =>
      (aliases || []).some((alias) => {
        const normalizedAlias = normalizePhrase(alias);
        return hasTokenSubsetMatch(normalizedAlias, phrase) || hasTokenSubsetMatch(phrase, normalizedAlias);
      })
    )
    .map(([role]) => role);
}

function sharesSkillFamily(a: string, b: string): boolean {
  const aFamilies = familiesForPhrase(a);
  if (aFamilies.length === 0) return false;

  const bFamilies = new Set(familiesForPhrase(b));
  return aFamilies.some((family) => bFamilies.has(family));
}

function phrasesMatch(a: string, b: string): boolean {
  return hasTokenSubsetMatch(a, b) || sharesSkillFamily(a, b);
}

function splitRequirements(requirements?: string): string[] {
  if (!requirements) return [];

  return requirements
    .split(/[\n,;|/]+/)
    .flatMap((segment) => segment.split(/\b(?:and|or)\b/i))
    .map((segment) => segment.replace(/[•]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function formatLabel(value: string): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function extractRequirements(job: Job): { key: string; label: string }[] {
  const requirementMap = new Map<string, string>();
  const roleLabel = ROLE_LABELS[job.role];
  const roleKey = normalizePhrase(roleLabel);

  if (roleKey) {
    requirementMap.set(roleKey, roleLabel);
  }

  for (const requirement of splitRequirements(job.requirements)) {
    const key = normalizePhrase(requirement);
    if (!key || requirementMap.has(key)) continue;
    requirementMap.set(key, formatLabel(requirement));
  }

  return Array.from(requirementMap.entries()).map(([key, label]) => ({ key, label }));
}

export function calculateSkillMatch(
  job: Job,
  user: Pick<JobSeeker, 'skills'>
): SkillMatchResult | null {
  const profileSkills = user.skills
    .map((skill) => skill.trim())
    .filter(Boolean)
    .map((skill) => ({ label: skill, key: normalizePhrase(skill) }))
    .filter((skill) => skill.key.length > 0)
    .filter((skill, index, all) => all.findIndex((candidate) => candidate.key === skill.key) === index);

  if (profileSkills.length === 0) {
    return null;
  }

  const jobRequirements = extractRequirements(job);
  if (jobRequirements.length === 0) {
    return null;
  }

  const matchedRequirements: string[] = [];
  const matchedSkills = new Set<string>();

  for (const requirement of jobRequirements) {
    const matchingSkills = profileSkills.filter((skill) => phrasesMatch(skill.key, requirement.key));

    if (matchingSkills.length === 0) {
      continue;
    }

    matchedRequirements.push(requirement.label);
    for (const skill of matchingSkills) {
      matchedSkills.add(skill.label);
    }
  }

  return {
    percentage: Math.round((matchedRequirements.length / jobRequirements.length) * 100),
    totalRequirements: jobRequirements.length,
    matchedRequirements,
    matchedSkills: Array.from(matchedSkills),
  };
}
