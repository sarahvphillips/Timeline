/** What the People and dates screen should say. It does not read timeline events. */

export function graphStatus({ peopleOn, spansOn, people, spans }) {
  const list = Array.isArray(people) ? people : [];
  const spanList = Array.isArray(spans) ? spans : [];
  const peopleCount = list.filter((person) => person && person.id && person.name).length;
  const birthdayCount = list.filter((person) => person && person.birthday).length;
  const spanCount = spanList.filter((span) => span && span.id).length;
  const lines = [];

  if (peopleOn && peopleCount === 0) {
    lines.push('No people saved yet. Add someone on the People screen. Timeline events are not drawn here.');
  } else if (peopleOn && birthdayCount === 0 && peopleCount > 0) {
    lines.push('People are saved, but none have a birthday, so no month is drawn.');
  }

  if (!spansOn) {
    lines.push('Days between is off.');
  } else if (spanCount === 0) {
    lines.push('No Days between saved yet.');
  }

  const showGraph = (peopleOn && peopleCount > 0) || (spansOn && spanCount > 0);
  return { showGraph, lines, peopleCount, spanCount, birthdayCount };
}
