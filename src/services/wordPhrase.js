function lettersOnly(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

export function phraseKey(phrase) {
  return String(phrase || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Same phrase already in the list, ignoring capitals and spacing. */
export function findSavedPhrase(list, phrase) {
  const key = phraseKey(phrase);
  const letters = lettersOnly(phrase);
  if (!key) return null;
  return (
    (list || []).find((item) => {
      if (phraseKey(item?.phrase) === key) return true;
      return !!(letters && lettersOnly(item?.phrase) === letters);
    }) || null
  );
}
