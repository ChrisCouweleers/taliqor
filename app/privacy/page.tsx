import type { Metadata } from "next";
import { PublicDocument } from "@/components/public-document";

export const metadata: Metadata = {
  title: "Privacy Policy — Taliqor",
  description: "How Taliqor collects, uses, protects, and deletes information.",
};

export default function PrivacyPage() {
  return (
    <PublicDocument
      eyebrow="PRIVACY POLICY"
      title="Your data should remain yours."
      description="This policy explains what Taliqor collects, why we need it, where it is processed, and the choices available to you."
    >
      <section><h2>1. Information we collect</h2><p>We collect account information such as your name, email address, company name, and workspace membership. At signup, we may record an IP address and approximate location for security and signup notifications.</p><p>When you use Taliqor, we process the CSV and Excel files you upload, selected worksheets, supporting evidence, column mappings, reconciliation results, explanations, proposed journal adjustments, close checklists, variance information, certifications, and other information you choose to enter.</p></section>
      <section><h2>2. How we use information</h2><p>We use this information to create and secure your account, provide reconciliation and close workflows, preserve your work, prevent abuse, troubleshoot problems, and improve the product.</p><p>We do not sell personal information or use uploaded financial records for advertising.</p></section>
      <section><h2>3. Where information is processed</h2><p>Taliqor uses Supabase for authentication, databases, and private file storage, and Vercel to host and deliver the application. These providers process information on our behalf under their own security and privacy commitments.</p></section>
      <section><h2>4. Access and sharing</h2><p>Workspace information is available to authenticated members of the same organization. Team members may be able to view and update shared reconciliation and close information. We may disclose information when required by law, to protect users or the service, or in connection with a business transfer.</p></section>
      <section><h2>5. Retention and deletion</h2><p>We retain workspace information while an account or shared workspace remains active. Users can delete their account from Settings. Deleting a private workspace removes its application records and archived source files. If the workspace is shared, company records remain with the other team members.</p><p>Limited copies may remain temporarily in provider backups, logs, or systems where immediate deletion is not technically practical or where retention is legally required.</p></section>
      <section><h2>6. Security</h2><p>We use private file storage, organization-level access controls, verified email login, encrypted connections, infrastructure encryption at rest, upload validation, rate limiting, and browser security protections. No online service can guarantee absolute security.</p></section>
      <section><h2>7. Your choices</h2><p>You may review information in your workspace, stop uploading information, remove uploaded workspace data by deleting a private workspace, or delete your account from Settings. Workspace owners should ensure they have authority to upload company and personal information.</p></section>
      <section><h2>8. Children</h2><p>Taliqor is a business product and is not directed to children under 13. We do not knowingly collect personal information from children.</p></section>
      <section><h2>9. Changes</h2><p>We may update this policy as Taliqor changes. The updated date above will show when the policy was last revised. Material changes may also be communicated through the product.</p></section>
      <section><h2>10. Contact</h2><p>Privacy questions and requests can be submitted by replying to an official Taliqor email or through the contact method provided within your Taliqor workspace.</p></section>
    </PublicDocument>
  );
}
