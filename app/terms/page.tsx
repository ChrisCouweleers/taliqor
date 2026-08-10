import type { Metadata } from "next";
import { PublicDocument } from "@/components/public-document";

export const metadata: Metadata = {
  title: "Terms of Use — Taliqor",
  description: "The terms governing use of the Taliqor open beta.",
};

export default function TermsPage() {
  return (
    <PublicDocument eyebrow="TERMS OF USE" title="Clear terms for a clearer close." description="These terms govern access to and use of the Taliqor open beta.">
      <section><h2>1. Using Taliqor</h2><p>You must be legally able to enter into these terms and authorized to act for any organization whose information you upload. You are responsible for your account, the accuracy and legality of your data, and the actions of people you invite.</p></section>
      <section><h2>2. The open beta</h2><p>Taliqor is currently an open-beta product provided without charge. Features may change, be limited, or be discontinued. We may introduce paid plans later, but we will not charge you without clear notice and affirmative agreement.</p></section>
      <section><h2>3. Financial information and professional judgment</h2><p>Taliqor helps organize, compare, and document financial records. It does not provide accounting, audit, tax, legal, or investment advice. You remain responsible for reviewing results, resolving exceptions, maintaining source records, and making financial decisions.</p></section>
      <section><h2>4. Your content</h2><p>You retain ownership of information you upload or create. You give Taliqor permission to host, process, copy, and display that information only as needed to operate, secure, support, and improve the service.</p></section>
      <section><h2>5. Acceptable use</h2><p>Do not use Taliqor unlawfully, attempt to access another organization’s workspace, probe or disrupt the service, upload malicious content, evade usage or security limits, or use the product to violate another person’s rights.</p></section>
      <section><h2>6. Security and account access</h2><p>Keep access to your email account secure and do not share login codes or invitation links. Notify us if you believe an account or workspace has been accessed without authorization.</p></section>
      <section><h2>7. Availability</h2><p>We work to keep Taliqor available and reliable, but the beta is provided on an “as is” and “as available” basis. We do not guarantee uninterrupted operation, error-free results, permanent storage, or that every reconciliation suggestion will be correct.</p></section>
      <section><h2>8. Limitation of liability</h2><p>To the maximum extent permitted by law, Taliqor will not be liable for indirect, incidental, special, consequential, exemplary, or lost-profit damages arising from use of the beta. Because the service is currently free, Taliqor’s aggregate liability will not exceed one hundred U.S. dollars.</p></section>
      <section><h2>9. Termination and deletion</h2><p>You may stop using Taliqor at any time and delete your account through Settings. We may suspend access when reasonably necessary to protect the service, users, or legal rights, or when these terms are materially violated.</p></section>
      <section><h2>10. Changes</h2><p>We may update these terms as the beta develops. Continued use after updated terms take effect means you accept the revised terms. If you do not agree, stop using the service and delete your account.</p></section>
      <section><h2>11. Contact</h2><p>Questions about these terms can be submitted by replying to an official Taliqor email or through the contact method provided within your workspace.</p></section>
    </PublicDocument>
  );
}
