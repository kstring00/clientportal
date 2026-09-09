import { redirect } from "next/navigation";

/** This deployment is the portal; there is no marketing site in front of it. */
export default function Home() {
  redirect("/portal");
}
