import { redirect } from "next/navigation";

/** The product opens on sign-in. A session still has to pass the form. */
export default function IndexPage() {
  redirect("/sign-in");
}
