/**
 * HTML body for Admin → Contracts → HTML template. Placeholders: {{clientDisplayName}},
 * {{agreementDate}}, {{agreementDateLong}}, {{projectName}}, {{projectLocation}},
 * {{leadDesignerName}}, {{clientSignerName}}.
 */
export const RESIDENTIAL_NEW_CONSTRUCTION_AGREEMENT_BODY_HTML = `
<h1>DESIGN SERVICE AGREEMENT (NEW CONSTRUCTION RESIDENTIAL)</h1>
<p>THIS AGREEMENT is entered into effective <strong>{{agreementDateLong}}</strong> (also noted as {{agreementDate}}), by and between Designer's Ink Graphic &amp; Building Designs, LLC (&quot;Designer&quot;) and <strong>{{clientDisplayName}}</strong> (&quot;Client&quot;).</p>
<p><strong>Project:</strong> {{projectName}}<br/>
<strong>Proposed residential project location:</strong> {{projectLocation}}<br/>
<strong>Lead designer (PlanPort record):</strong> {{leadDesignerName}}</p>

<h2>1. SCOPE OF SERVICES</h2>
<p>The Designer shall provide the following Services to the Client for the proposed residential project located at <strong>{{projectLocation}}</strong>:</p>
<ul>
<li><strong>Building Design:</strong> Design services for the residential project layout.</li>
<li><strong>Virtual 3D Modeling:</strong> Creation of a virtual model of the project to the level of detail requested by the Client.</li>
<li><strong>Construction Documents:</strong> Provision of a plan set to include floor plans, a non-engineered foundation layout, roof plan, electrical plan, exterior elevations, and a non-engineered site plan.</li>
</ul>

<h2>2. PROFESSIONAL DISCLOSURES &amp; LIMITATIONS</h2>
<ul>
<li><strong>Non-Architect Status:</strong> The Designer is a Building Designer and NOT a licensed architect. Designer operates within Oklahoma state law under the State Architectural and Registered Commercial Interior Designers Act.</li>
<li><strong>Jurisdictional Compliance:</strong> It is noted that the vast majority of jurisdictions exempt residential building designs from requiring an architect's stamp; however, it is the sole responsibility of the Client to ensure using a non-architect building designer is allowed in their jurisdiction and to determine if the project requires plans stamped by a licensed architect. The Client hereby warrants and represents that the project falls within the &quot;exempt&quot; categories of the State Architectural and Registered Commercial Interior Designers Act and does not legally require the services of a licensed architect. If a building official or jurisdictional authority determines the project is not exempt, Designer's services shall immediately cease until Client retains a licensed architect to oversee and stamp the work at Client's sole expense.</li>
<li><strong>Site Restrictions &amp; Compliance:</strong> If a Homeowners Association (HOA) exists for the property site, a copy of the HOA Covenants must be provided by the Client to the Designer prior to design work beginning to ensure compliance. The Client will provide the Designer with any restrictions for the project site, such as building setback requirements, easements, or other restrictions which might limit the placement of the building on the site. The Client will be responsible for ensuring all necessary utilities are available for the project site.</li>
<li><strong>Engineering Services:</strong> The Designer does not provide any structural or professional engineering services. Designer will work directly with the Client's third-party engineer if engineering is required for the project. Any foundation or site layouts provided are for &quot;spatial intent and conceptual coordination only&quot; and must be verified and stamped by a Professional Engineer (PE) before use.</li>
<li><strong>Plan Review &amp; Acceptance:</strong> All plans will be reviewed by the Client and their General Contractor before materials are ordered or construction begins to ensure they find no issues with the plan set they want to modify or correct. Once materials are ordered or construction begins, the plans will be considered accepted as is.</li>
</ul>

<h2>3. FEES, PAYMENT, AND COLLECTION</h2>
<ul>
<li><strong>Design Fees:</strong> Design fees are estimated to be $1.50 per heated square foot. This includes the initial layout and three revision sessions for the design. Once the design is approved, this fee also includes one set of Construction Documents (floor plans, non-engineered foundation layout, roof plan, electrical plan, exterior elevations, and a non-engineered site plan).</li>
<li>The Client will be billed at an hourly rate of $115.00 per billable hour up to the $1.50 per heated square foot rate. The per Heated Square Foot Rate is a cap rate; if the total hourly billing ends up being less than the per Heated Square Foot Rate, the Client will pay the lesser of the two amounts. Design fees will not exceed the $1.50 per heated square foot rate unless additional revisions are requested beyond the three included sessions or after construction documents are completed. Additional revision sessions or revisions requested after construction documents are completed will be billed at the hourly rate of $115.00. Attached non-heated garages, porches, and mechanical spaces are included in the $1.50 rate at no cost. Detached shop buildings, swimming pools, and other detached structures will be billed at the hourly rate of $115.00 per billable hour.</li>
<li><strong>Minimum Fee and Square Footage Reductions:</strong> All billable hours incurred are due and payable regardless of any subsequent reductions in the project's square footage. The $1.50 per heated square foot rate is calculated based on the maximum heated square footage designed during the project's development. Any request by the Client to reduce the square footage of the building after design work has commenced will not result in a credit, refund, or reduction of the hourly fees already billed.</li>
<li><strong>Estimates:</strong> All time and fee estimates given are based on the scope of the project presented by the Client to the Designer at the time of the estimate. Any requested changes or issues not presented to the Designer in the original scope will affect the number of hours needed to complete your project. The Client may request an update on the number of billable hours anytime throughout the design process.</li>
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
<li><strong>Indemnification:</strong> Client agrees to indemnify and hold harmless Designer and its affiliates for any liability or claim arising out of the Services provided.</li>
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
