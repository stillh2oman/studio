import { redirect } from "next/navigation";

/** Legacy PlanPort path; command center is `/`, portal landing is `/portal`. */
export default function PortalHomeRedirectPage() {
  redirect("/portal");
}
