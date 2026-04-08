/**
 * HTML body for Admin → Contracts → HTML template. Placeholders: {{clientDisplayName}},
 * {{agreementDate}}, {{agreementDateLong}}, {{projectName}}, {{projectLocation}},
 * {{leadDesignerName}}, {{clientSignerName}}.
 */
export const COMMERCIAL_ADDITIONS_REMODELS_AGREEMENT_BODY_HTML = `
<h1>DESIGN SERVICE AGREEMENT (COMMERCIAL ADDITIONS &amp; REMODELS)</h1>
<p>THIS AGREEMENT is entered into effective <strong>{{agreementDateLong}}</strong> (also noted as {{agreementDate}}), by and between Designer's Ink Graphic &amp; Building Designs, LLC (&quot;Designer&quot;) and <strong>{{clientDisplayName}}</strong> (&quot;Client&quot;).</p>
<p><strong>Project:</strong> {{projectName}}<br/>
<strong>Project location / site (addition or remodel):</strong> {{projectLocation}}<br/>
<strong>Lead designer (PlanPort record):</strong> {{leadDesignerName}}</p>

<h2>1. SCOPE OF SERVICES</h2>
<p>The Designer shall provide the following Services to the Client relating to the addition or remodel of the project located at <strong>{{projectLocation}}</strong>:</p>
<ul>
<li><strong>As-Built Drawings:</strong> Creation of drawings reflecting the existing layout based on either Client-provided measurements or on-site measurements taken by the Designer.</li>
<li><strong>Existing Condition Limitations:</strong> The Client acknowledges that the Designer may not be able to access certain enclosed spaces, determine exact wall thicknesses, or safely access roof or attic spaces to take full measurements.</li>
<li><strong>Building Design:</strong> Design services for the new layout, addition, or remodel.</li>
<li><strong>Virtual 3D Modeling:</strong> Creation of a virtual model to the level of detail requested by the Client.</li>
<li><strong>Construction Documents:</strong> Provision of a plan set to include floor plans, a non-engineered foundation layout, roof plan, electrical plan, life safety plan, exterior elevations, ADA details, and a non-engineered site plan.</li>
</ul>

<h2>2. PROFESSIONAL DISCLOSURES &amp; LIMITATIONS</h2>
<ul>
<li><strong>Non-Architect Status:</strong> The Designer is a Building Designer and NOT a licensed architect. Designer operates within Oklahoma state law under the State Architectural and Registered Commercial Interior Designers Act.</li>
<li><strong>Jurisdictional Compliance:</strong> It is the sole responsibility of the Client to consult local state statutes and city ordinances to determine if the project requires plans stamped by a licensed architect. The Client hereby warrants and represents that the project falls within the &quot;exempt&quot; categories of the State Architectural and Registered Commercial Interior Designers Act and does not legally require the services of a licensed architect. If a building official or jurisdictional authority determines the project is not exempt, Designer's services shall immediately cease until Client retains a licensed architect to oversee and stamp the work at Client's sole expense.</li>
<li><strong>Engineering Services:</strong> The Designer does not provide any structural or professional engineering services. Designer will work directly with the Client's third-party engineer if engineering is required for the project. Any foundation or site layouts provided are for &quot;spatial intent and conceptual coordination only&quot; and must be verified and stamped by a Professional Engineer (PE) before use.</li>
<li><strong>Plan Review &amp; Measurement Verification:</strong> All plans will be reviewed by the Client and their General Contractor before materials are ordered or construction begins. The General Contractor is solely responsible for field-verifying all measurements, dimensions, existing conditions, and local code requirements on-site prior to the start of construction. Once materials are ordered or construction begins, the plans will be considered accepted as is.</li>
</ul>

<h2>3. FEES, PAYMENT, AND COLLECTION</h2>
<ul>
<li><strong>Hourly Rate:</strong> The fees will be calculated at a rate of $115.00 per billable hour.</li>
<li><strong>Estimates:</strong> All time and fee estimates given are based on the scope of the project presented by the Client to the Designer at the time of the estimate. Any requested changes or issues not presented to the Designer by the Client in the original scope will affect the number of hours needed to complete the project. The Client may request an update on billable hours anytime throughout the design process.</li>
<li><strong>Invoicing:</strong> The Client will be billed approximately every two weeks for the hours worked.</li>
<li><strong>Late Payments &amp; Interest:</strong> All invoices are to be paid within 10 days. Any unpaid balance shall accrue interest at the rate of 1.5% per month (18% per annum) or the highest rate allowed by law.</li>
<li><strong>Suspension of Services &amp; License:</strong> No further work will be completed on projects with outstanding invoices past 10 days. If an invoice remains unpaid for 30 days, the non-exclusive license to use the design is automatically revoked until payment is made. Continued use of the designs thereafter constitutes copyright infringement. Construction is not to begin until all invoices are paid in full.</li>
<li><strong>Mechanic's Liens:</strong> In the event the Client fails to pay as agreed, Designer reserves the right to file mechanic's liens against the property. All court costs, lien costs, collection agency fees, and attorney fees will be added to the invoice.</li>
</ul>

<h2>4. INDEMNIFICATION</h2>
<ul>
<li><strong>Reliance on Client Data:</strong> Designer shall be entitled to rely on the accuracy of all information, plans, photos, or sketches provided by the Client. Designer is not liable for errors resulting from inaccurate client-provided data.</li>
<li><strong>Maximum Damages:</strong> The maximum amount of damages the Client is entitled to in any claim relating to this Agreement is not to exceed the Total Cost of Services provided by the Designer.</li>
<li><strong>Betterment Clause:</strong> Designer shall not be liable for the cost of any omitted items or design features that would have been required for a complete project and would have otherwise been paid for by the Client had the item been included in the original design.</li>
<li><strong>Construction Oversight:</strong> Designer does not provide construction site supervision. Designer is not responsible for the Contractor's failure to carry out work in accordance with the design or for safety precautions on the job site.</li>
<li><strong>Indemnification:</strong> Client agrees to indemnify and hold harmless Designer for any liability or claim arising out of the Services provided.</li>
</ul>

<h2>5. INTELLECTUAL PROPERTY</h2>
<ul>
<li><strong>Ownership:</strong> Designer owns all copyrights in any and all work it creates or produces pursuant to federal copyright law.</li>
<li><strong>Proprietary Files:</strong> Original Chief Architect files and templates are proprietary and will not be provided. CAD files (.dwg) can be provided to third-party engineers at no charge.</li>
</ul>

<h2>6. GOVERNING LAW AND JURISDICTION</h2>
<ul>
<li><strong>Governing Law:</strong> The laws of Oklahoma govern all matters arising out of or relating to this Agreement.</li>
<li><strong>Jurisdiction:</strong> The Parties agree that the exclusive court of jurisdiction for any legal actions taken related to this contract will be the Payne County District Court in Payne County, Oklahoma.</li>
</ul>

<h2>7. TERMINATION</h2>
<ul>
<li>Either party may terminate the relationship at any time without penalty so long as all billable hours up to the point of termination are paid in full.</li>
<li>If the Designer terminates the relationship, the Designer will provide all work completed to that point in electronic format (.pdf) as well as in CAD (.dwg) format. The delivery of CAD files is contingent upon the Client executing a separate Digital Release and Waiver, holding the Designer harmless for any subsequent modifications or use of the files by third parties.</li>
</ul>

<h2>SIGNATURES</h2>
<p>The parties execute this Agreement electronically. Client printed name as entered at signing: <strong>{{clientSignerName}}</strong>. Client address / site reference on file: <strong>{{projectLocation}}</strong>. Designer is signing for Designer's Ink Graphic &amp; Building Designs, LLC; lead designer of record: <strong>{{leadDesignerName}}</strong>.</p>
<p>Electronic signature images and execution timestamp appear on the certificate section following this agreement text.</p>
`.trim();
