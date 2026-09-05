const LINKS_KEY = 'quicklinks';
const ENGINES_KEY = 'searchEngines';

const DEFAULT_ENGINES = [
  {
    id: 'google',
    name: 'Google',
    icon: 'icons/google.png',
    prefix: 'g',
    searchUrl: 'https://www.google.com/search?q={query}',
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    icon: 'icons/chatgpt.png',
    prefix: 'ch',
    searchUrl: 'https://chatgpt.com/?prompt={query}',
  },
  {
    id: 'claude',
    name: 'Claude',
    icon: 'icons/claude.png',
    prefix: 'cl',
    searchUrl: 'https://claude.ai/new?q={query}',
  },
];

const ROUTINES_KEY = 'routines';

const DEFAULT_ROUTINES = [
  { name: 'Morning', urls: ['https://mail.google.com', 'https://news.ycombinator.com', 'https://devurls.com'] },
  { name: 'Dev', urls: ['https://github.com', 'https://claude.ai', 'https://chatgpt.com'] },
];

export async function getRoutines() {
  const result = await chrome.storage.sync.get(ROUTINES_KEY);
  return result[ROUTINES_KEY] ?? structuredClone(DEFAULT_ROUTINES);
}

export async function saveRoutines(routines) {
  await chrome.storage.sync.set({ [ROUTINES_KEY]: routines });
}

export async function getEngines() {
  const result = await chrome.storage.sync.get(ENGINES_KEY);
  const saved = result[ENGINES_KEY];
  if (!saved) return structuredClone(DEFAULT_ENGINES);
  return DEFAULT_ENGINES.map((def) => ({
    ...def,
    ...saved.find((e) => e.id === def.id),
  }));
}

export async function saveEngines(engines) {
  const overrides = engines.map(({ id, prefix, searchUrl }) => ({ id, prefix, searchUrl }));
  await chrome.storage.sync.set({ [ENGINES_KEY]: overrides });
}

const GROUPS_KEY = 'quicklinkGroups';
const ACTIVE_GROUP_KEY = 'activeQuicklinkGroup';

const DEFAULT_LINKS = [
  { name: 'Instagram', url: 'https://www.instagram.com' },
  { name: 'Claude', url: 'https://claude.ai' },
  { name: 'HN', url: 'https://news.ycombinator.com' },
  { name: 'DevURLS', url: 'https://devurls.com' },
];

export async function getGroups() {
  const result = await chrome.storage.sync.get([GROUPS_KEY, LINKS_KEY]);
  if (result[GROUPS_KEY]?.length) return result[GROUPS_KEY];

  // Migrate pre-groups flat quicklinks into a single "General" tab
  const legacy = result[LINKS_KEY];
  const groups = [
    { id: 'general', name: 'General', links: legacy ?? structuredClone(DEFAULT_LINKS) },
  ];
  if (legacy) {
    await chrome.storage.sync.set({ [GROUPS_KEY]: groups });
    await chrome.storage.sync.remove(LINKS_KEY);
  }
  return groups;
}

export async function saveGroups(groups) {
  await chrome.storage.sync.set({ [GROUPS_KEY]: groups });
}

export async function getActiveGroupId() {
  const result = await chrome.storage.local.get(ACTIVE_GROUP_KEY);
  return result[ACTIVE_GROUP_KEY] ?? null;
}

export async function setActiveGroupId(id) {
  await chrome.storage.local.set({ [ACTIVE_GROUP_KEY]: id });
}

export async function addGroup(name) {
  const groups = await getGroups();
  const group = { id: crypto.randomUUID(), name, links: [] };
  groups.push(group);
  await saveGroups(groups);
  return group;
}

export async function renameGroup(id, name) {
  const groups = await getGroups();
  const group = groups.find((g) => g.id === id);
  if (group) group.name = name;
  await saveGroups(groups);
  return groups;
}

export async function deleteGroup(id) {
  const groups = await getGroups();
  const remaining = groups.filter((g) => g.id !== id);
  if (!remaining.length) {
    remaining.push({ id: 'general', name: 'General', links: [] });
  }
  await saveGroups(remaining);
  return remaining;
}

export async function reorderGroup(fromId, toId) {
  const groups = await getGroups();
  const from = groups.findIndex((g) => g.id === fromId);
  const to = groups.findIndex((g) => g.id === toId);
  if (from === -1 || to === -1) return groups;
  const [moved] = groups.splice(from, 1);
  groups.splice(to, 0, moved);
  await saveGroups(groups);
  return groups;
}

export async function reorderLink(groupId, from, to) {
  const groups = await getGroups();
  const group = groups.find((g) => g.id === groupId);
  if (group) {
    const [moved] = group.links.splice(from, 1);
    group.links.splice(to, 0, moved);
  }
  await saveGroups(groups);
  return groups;
}

export async function moveLinkToGroup(fromGroupId, index, toGroupId) {
  const groups = await getGroups();
  const from = groups.find((g) => g.id === fromGroupId);
  const to = groups.find((g) => g.id === toGroupId);
  if (from && to && from !== to) {
    const [link] = from.links.splice(index, 1);
    to.links.push(link);
  }
  await saveGroups(groups);
  return groups;
}

export async function addLink(groupId, link) {
  const groups = await getGroups();
  const group = groups.find((g) => g.id === groupId);
  if (group) group.links.push(link);
  await saveGroups(groups);
  return groups;
}

export async function updateLink(groupId, index, link) {
  const groups = await getGroups();
  const group = groups.find((g) => g.id === groupId);
  if (group) group.links[index] = link;
  await saveGroups(groups);
  return groups;
}

export async function removeLink(groupId, index) {
  const groups = await getGroups();
  const group = groups.find((g) => g.id === groupId);
  if (group) group.links.splice(index, 1);
  await saveGroups(groups);
  return groups;
}
