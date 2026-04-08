/**
 * Compose multiline project address for PlanPort directory / Create Client “Project address” field.
 */
export function composeProjectAddressForDirectory(input: {
  projectStreetAddress: string;
  projectCity: string;
  projectState: string;
  subdivisionName?: string | null;
  permittingAgency?: string | null;
  siteDescription: string;
}): string {
  const lines: string[] = [];
  const street = input.projectStreetAddress.trim();
  const city = input.projectCity.trim();
  const state = input.projectState.trim();
  if (street) lines.push(street);
  const cityState = [city, state].filter(Boolean).join(", ");
  if (cityState) lines.push(cityState);
  const sub = input.subdivisionName?.trim();
  if (sub) lines.push(`Subdivision: ${sub}`);
  const permit = input.permittingAgency?.trim();
  if (permit) lines.push(`Permitting agency: ${permit}`);
  const site = input.siteDescription.trim();
  if (site) lines.push(`Site description: ${site}`);
  return lines.join("\n");
}

/** One-line summary for admin submission list (matches legacy `projectLocation` column). */
export function projectLocationListSummary(input: {
  projectStreetAddress: string;
  projectCity: string;
  projectState: string;
}): string {
  const street = input.projectStreetAddress.trim();
  const tail = [input.projectCity.trim(), input.projectState.trim()].filter(Boolean).join(", ");
  if (street && tail) return `${street}, ${tail}`;
  if (street) return street;
  return tail;
}
