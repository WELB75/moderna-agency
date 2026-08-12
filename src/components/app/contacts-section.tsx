"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PhoneLink } from "@/components/app/phone-link";
import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";
import { AddContactDialog, type ExistingContact } from "@/components/app/add-contact-dialog";
import { deleteContact } from "@/lib/actions/contacts";
import { CONTACT_ROLE_LABELS } from "@/lib/contact-roles";

export type ContactRow = {
  id: string;
  villaId: string | null;
  domaineId: string | null;
  role: string;
  nom: string;
  telephone: string | null;
  notes: string | null;
  paiementRecurrent: boolean;
};

export function ContactsSection({
  contacts,
  interventionCounts,
  paidThisMonth,
  villaId,
  domaineId,
  domaineNom,
  existingContacts,
}: {
  contacts: ContactRow[];
  interventionCounts: Record<string, number>;
  paidThisMonth: Set<string>;
  villaId: string;
  domaineId: string | null;
  domaineNom: string | null;
  existingContacts: ExistingContact[];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">Contacts</CardTitle>
        <AddContactDialog
          villaId={villaId}
          domaineId={domaineId}
          domaineNom={domaineNom}
          existingContacts={existingContacts}
        />
      </CardHeader>
      <CardContent className="space-y-2">
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun contact enregistré.</p>
        ) : (
          contacts.map((c) => {
            const count = interventionCounts[c.nom.trim().toLowerCase()] ?? 0;
            const isPaid = paidThisMonth.has(c.nom.trim().toLowerCase());
            return (
              <div key={c.id} className="flex items-start justify-between gap-2 rounded-md border p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{CONTACT_ROLE_LABELS[c.role] ?? c.role}</Badge>
                    <p className="font-medium">{c.nom}</p>
                    {!c.villaId && c.domaineId ? (
                      <Badge variant="secondary" className="text-xs">
                        Domaine entier
                      </Badge>
                    ) : null}
                  </div>
                  {c.telephone ? <PhoneLink phone={c.telephone} className="mt-1.5" /> : null}
                  {c.notes ? <p className="mt-1 text-sm text-muted-foreground">{c.notes}</p> : null}
                  {count > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {count} intervention{count > 1 ? "s" : ""} déjà réalisée{count > 1 ? "s" : ""}
                    </p>
                  ) : null}
                  {c.paiementRecurrent ? (
                    <Badge className="mt-1.5" variant={isPaid ? "default" : "destructive"}>
                      {isPaid ? "Payé ce mois-ci" : "Pas encore payé ce mois-ci"}
                    </Badge>
                  ) : null}
                </div>
                <ConfirmDeleteButton
                  action={deleteContact.bind(null, c.id)}
                  title="Supprimer ce contact ?"
                  description="Cette action est irréversible."
                />
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
