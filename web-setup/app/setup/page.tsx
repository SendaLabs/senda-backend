import { fetchSetupInfo } from "../../lib/backend";
import { SetupClient } from "./setup-client";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  const initial = await fetchSetupInfo(token);
  return (
    <main>
      <SetupClient token={token.trim()} initial={initial} />
    </main>
  );
}
