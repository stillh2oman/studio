"use client";

import Link from "next/link";
import { LayoutDashboard, FolderOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCollection, useMemoFirebase } from "@planport/firebase";
import { useDirectoryStore } from "@/firebase/use-directory-store";
import { collection } from "firebase/firestore";
import { PLANPORT_CLIENT_ROOT } from "@/lib/planport-project-paths";
import { CreateProjectDialog } from "@planport/components/admin/CreateProjectDialog";
import { CopyProjectToContractorDialog } from "@planport/components/admin/CopyProjectToContractorDialog";
import { EditClientDialog } from "@planport/components/admin/EditClientDialog";
import { DeletePrivateClientButton } from "@planport/components/admin/DeletePrivateClientButton";
import { DeleteProjectButton } from "@planport/components/admin/DeleteProjectButton";

type DirectoryClient = {
  id: string;
  husbandName: string;
  wifeName?: string | null;
  address?: string | null;
  accessCode?: string;
  email?: string;
  phone?: string;
  allowDownloads?: boolean;
};

export function PrivateClientDirectoryCard({ client }: { client: DirectoryClient }) {
  const { planportDb } = useDirectoryStore();
  const displayName = client.wifeName ? `${client.husbandName} & ${client.wifeName}` : client.husbandName;

  const projectsQuery = useMemoFirebase(
    () => collection(planportDb, PLANPORT_CLIENT_ROOT, client.id, "projects"),
    [planportDb, client.id]
  );
  const { data: projects } = useCollection(projectsQuery);
  const projectList = (projects ?? []) as {
    id: string;
    name?: string;
    individualClientId?: string | null;
    generalContractorId?: string | null;
  }[];
  const projectCount = projectList.length;

  return (
    <Card className="group overflow-hidden border-border hover:border-muted-foreground/40 transition-colors duration-200 bg-card">
      <div className="h-32 relative flex flex-col items-center justify-center border-b border-border overflow-hidden bg-secondary">
        <FolderOpen className="h-12 w-12 text-muted-foreground shrink-0" strokeWidth={1.25} aria-hidden />
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">Private client</span>
        <div className="absolute top-4 right-4">
          <Badge className="bg-primary text-primary-foreground font-mono">{client.accessCode ?? "—"}</Badge>
        </div>
      </div>
      <CardHeader>
        <CardTitle className="text-xl text-foreground truncate">{displayName}</CardTitle>
        <p className="text-xs text-muted-foreground truncate">{client.address || "No address provided"}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2">
          <Link href={`/dashboard/client/${client.id}`} className="w-full">
            <Button
              variant="outline"
              className="w-full justify-between hover:bg-accent hover:text-accent-foreground bg-card"
            >
              Open Client Hub
              <LayoutDashboard className="w-4 h-4 ml-2" />
            </Button>
          </Link>
          <CreateProjectDialog type="client" parentId={client.id} parentName={client.husbandName} />
          <CopyProjectToContractorDialog clientId={client.id} clientDisplayName={displayName} />
          <EditClientDialog
            client={{
              ...client,
              accessCode: client.accessCode ?? "",
              wifeName: client.wifeName ?? undefined,
              address: client.address ?? undefined,
            }}
          />
          <DeletePrivateClientButton
            clientId={client.id}
            displayName={displayName}
            projectCount={projectCount}
          />
        </div>

        {projectCount > 0 ? (
          <div className="rounded-md border border-border bg-secondary p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Projects in portfolio</p>
            <ul className="space-y-2">
              {projectList.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm border-b border-border last:border-0 pb-2 last:pb-0"
                >
                  <span className="font-medium text-foreground truncate">{p.name || p.id}</span>
                  <DeleteProjectButton
                    hubId={client.id}
                    hubType="client"
                    project={{
                      id: p.id,
                      name: p.name || p.id,
                      individualClientId: p.individualClientId ?? client.id,
                      generalContractorId: p.generalContractorId ?? null,
                    }}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">No projects yet — use New project or open the hub.</p>
        )}
      </CardContent>
    </Card>
  );
}
