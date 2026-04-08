/**
 * HTML body for Admin → Contracts → built-in template. Same placeholder set as other agreements:
 * {{clientDisplayName}}, {{agreementDate}}, {{agreementDateLong}}, {{projectName}}, {{projectLocation}},
 * {{leadDesignerName}}, {{clientSignerName}}.
 */
export const DIGITAL_FILE_RELEASE_WAIVER_BODY_HTML = `
<h1>DIGITAL FILE RELEASE AND WAIVER OF LIABILITY</h1>

<p><strong>DATE:</strong> {{agreementDateLong}} <span class="text-muted-foreground">(reference: {{agreementDate}})</span></p>
<p><strong>PROJECT:</strong> {{projectName}}</p>
<p><strong>CLIENT:</strong> {{clientDisplayName}}</p>
<p><strong>ORIGINAL DESIGNER:</strong> Designer&apos;s Ink Graphic &amp; Building Designs, LLC</p>
<p><strong>Project location / site (on file):</strong> {{projectLocation}}</p>

<h2>1. RELEASE OF DIGITAL FILES</h2>
<p>At the request of the Client, the Designer is providing certain electronic digital files (the &quot;Files&quot;) in CAD (.dwg) and/or .pdf format. These Files represent work performed by the Designer up to the date of this Release.</p>

<h2>2. &quot;AS-IS&quot; CONDITION AND LIMITATIONS</h2>
<p>The Client acknowledges and agrees that:</p>
<ul>
<li>The Files are provided &quot;AS-IS&quot; and without any warranty of any kind, express or implied, including any warranty of fitness for a particular purpose.</li>
<li>Digital files can be altered, intentionally or unintentionally, by the hardware or software used by the recipient. The Designer is not responsible for the accuracy, completeness, or readability of the Files once they leave the Designer&apos;s digital environment.</li>
<li>The Files are not Construction Documents. They are for coordination and spatial intent only. Any use or transition of these Files for construction or permitting by a third party is at the Client&apos;s sole risk.</li>
</ul>

<h2>3. REMOVAL OF IDENTIFICATION AND METADATA</h2>
<p>If the Client or a third party (such as another designer or engineer) modifies the Files:</p>
<ul>
<li>The Client shall ensure that all references to &quot;Designer&apos;s Ink Graphic &amp; Building Designs, LLC&quot; and/or &quot;Jeff Dillon&quot; are immediately and completely removed from the title blocks, layers, block attributes, and file metadata.</li>
<li>The Client shall not represent, or allow any third party to represent, that the modified design is the work of the Designer.</li>
</ul>

<h2>4. INDEMNIFICATION AND HOLD HARMLESS</h2>
<p>To the fullest extent permitted by law, the Client agrees to indemnify, defend, and hold harmless the Designer, its officers, and employees from any and all claims, losses, liabilities, and expenses (including reasonable attorney fees) arising out of or resulting from:</p>
<ul>
<li>Any use of the Files by the Client or a third party.</li>
<li>Any modifications made to the Files by anyone other than the Designer.</li>
<li>The presence of the Designer&apos;s name or professional identity on any modified versions of the Files.</li>
</ul>

<h2>5. NO CONTINUING DUTY</h2>
<p>The Designer has no obligation to update the Files for any changes in the design, field conditions, or local codes occurring after the date of this Release.</p>

<h2>6. GOVERNING LAW</h2>
<p>This Release shall be governed by the laws of the State of Oklahoma, and any disputes shall be resolved in the Payne County District Court.</p>

<h2>ACKNOWLEDGMENT AND SIGNATURE</h2>
<p>By signing below, the Client acknowledges that they have read and understood the risks associated with the transfer of editable digital files and agree to the terms of this Release.</p>

<p><strong>CLIENT:</strong></p>
<p>Signature: <em>(electronic signature captured at signing)</em><br/>
Print name as entered at signing: <strong>{{clientSignerName}}</strong></p>

<p><strong>DESIGNER:</strong></p>
<p>Signature: <em>(electronic signature captured at signing)</em><br/>
Print name: <strong>{{leadDesignerName}}</strong><br/>
Title: Owner, Designer&apos;s Ink Graphic &amp; Building Designs, LLC</p>

<p>Electronic signature images and execution timestamp appear on the certificate section following this agreement text.</p>
`.trim();
