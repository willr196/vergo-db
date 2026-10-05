/**
 * VERGO's working wording for the Key Information Document, the zero-hours
 * employment agreement, the assignment confirmation and the business-client
 * Terms of Business. These are the system versions: Ops saves each as a
 * DocumentTemplate version, and any change made in Ops is a new version.
 *
 * DRAFT FOR LEGAL REVIEW. Written to the structure VERGO set out; it has not
 * been reviewed by a solicitor. See docs/VERGO-OPS.md.
 *
 * Format: "# " heading, "## " subheading, "- " list item, blank line between
 * paragraphs. {{key}} is filled in when the document is issued: company.*,
 * worker.*, client.*, doc.* and today from the record; example.* (KID pay
 * example) and terms.* (commercial terms) from the values frozen into the
 * template version, so one version number always means one wording.
 */

export const KID_BODY = `# KEY INFORMATION DOCUMENT

This document contains key information relating to your relationship with VERGO, the employment business that will employ you, and identifies the other documents that contain further information where appropriate. Please read it before you agree your employment agreement. It does not replace your employment agreement.

Worker: {{worker.name}}
Issued: {{today}}
Document: Key Information Document, version {{doc.version}}, effective {{doc.effectiveDate}}

## 1. Your employment business
Name: {{company.legalName}} trading as {{company.tradingName}} ("VERGO")
Company number: {{company.number}}
Registered office: {{company.registeredOffice}}
Contact: {{company.email}}, {{company.phone}}

## 2. Type of contract
Engagement: zero-hours contract of employment, the VERGO Zero-Hours Employment Agreement.
You will be employed by {{company.legalName}}. There are no guaranteed minimum hours. VERGO does not have to offer you work, and you may accept or decline any assignment offered to you.
You will work temporary assignments for VERGO's clients (the "hirers"), mainly hospitality and events work in London and the surrounding areas.

## 3. Who will pay you
{{company.legalName}} will pay you. The hirer does not pay you.
You will be paid for the hours you genuinely work whether or not the hirer has paid VERGO.

## 4. How often you will be paid
Normally monthly, on the last working day of each calendar month, for the hours worked and submitted through VERGO's timesheet process for that pay period.

## 5. Minimum expected rate of pay
The applicable assignment rate, which will never be below the legal minimum (the National Minimum Wage or National Living Wage) that applies to you.
Assignment rates may vary, for example by role, hirer, location, time of day or the experience required. You will be told the rate for each assignment before you accept it, and it will be set out in your Assignment Confirmation.

## 6. Deductions from your pay
The following will be deducted from your pay where they apply to you:
- Income Tax through PAYE
- employee National Insurance contributions
- workplace pension contributions, where you are enrolled or have opted in
- student loan or postgraduate loan repayments, where HMRC tells VERGO to make them
- attachment of earnings orders or other deductions VERGO is required to make by law
- recovery of a genuine overpayment of wages, where the law allows it

## 7. Fees
VERGO does not charge you a fee for finding you work.

## 8. Holiday entitlement and holiday pay
You are entitled to paid statutory holiday under the Working Time Regulations 1998. Because the hours you work are irregular, your holiday entitlement builds up as you work.
Where the law allows it for irregular-hours workers, VERGO may pay your holiday pay as rolled-up holiday pay: an additional 12.07% of your pay for the hours you work, paid with your wages each pay period and shown as a separate line on your payslip. Holiday pay that has been rolled up is not paid again when you take the time off, so please plan for this and do take time off to rest.
Where rolled-up holiday pay does not apply to you, your holiday pay will be calculated and paid when you take holiday, as set out in your employment agreement.

## 9. Other benefits
Workplace pension: VERGO will assess you for automatic enrolment into a workplace pension scheme as the law requires, and will write to you about your rights.
You may also be entitled to statutory payments such as Statutory Sick Pay and statutory family leave pay where you meet the qualifying conditions.

## 10. Representative example of pay
This example is illustrative only. It is not a promise of work, hours or pay.
Hours worked in the pay period: {{example.hours}}
Hourly base pay: {{example.hourlyRate}}
Base pay: {{example.basePay}}
Holiday pay ({{example.holidayPercent}}, rolled up): {{example.holidayPay}}
Gross pay: {{example.grossPay}}
Income Tax: {{example.incomeTax}}
Employee National Insurance: {{example.employeeNi}}
Pension contribution: {{example.pension}}
Other deductions: {{example.otherDeductions}}
Net pay: {{example.netPay}}
{{example.note}}
Your actual deductions depend on your tax code, National Insurance category, earnings in the pay period, any pension enrolment and your individual circumstances, so your own payslip will differ from this example.

## 11. Where to find further information
- Your terms of employment: the VERGO Zero-Hours Employment Agreement.
- Each assignment: the Assignment Confirmation VERGO sends you before it starts (hirer, location, hours, pay rate, duties and health and safety information).
- How VERGO uses your personal data: the VERGO privacy notice at {{company.privacyUrl}}.
- Questions about this document: {{company.email}}.
`;

export const AGREEMENT_BODY = `# VERGO ZERO-HOURS EMPLOYMENT AGREEMENT

This agreement is between {{company.legalName}} trading as {{company.tradingName}} (company number {{company.number}}, registered office {{company.registeredOffice}}) ("VERGO", "we", "us") and {{worker.name}} ("you").

Agreement version {{doc.version}}, effective {{doc.effectiveDate}}. Issued to you on {{today}}.

This agreement, together with your Key Information Document and the Assignment Confirmation for each assignment, sets out the terms of your employment. It is also your written statement of employment particulars.

## 1. VERGO and your employment
1.1 VERGO operates as an employment business. VERGO employs you and supplies you to VERGO's clients ("hirers") to work temporarily under their supervision and direction.
1.2 You are employed by VERGO on a zero-hours basis for temporary hospitality and event assignments. You are not employed by any hirer.
1.3 Your employment begins on the date you agree this agreement, which is recorded with your acceptance. No employment with a previous employer counts towards your period of continuous employment.

## 2. Roles
2.1 Assignments may be in roles including: waiting staff, bartenders, kitchen porters, runners, hosts, front-of-house staff, event staff, catering staff, chefs and cooks (where appropriately qualified), event set-up and clear-down, and other hospitality or event roles agreed with you.
2.2 The role, duties and requirements for each assignment are set out in its Assignment Confirmation.

## 3. No guaranteed hours
3.1 There are no guaranteed minimum hours. VERGO is not obliged to offer you any work and does not have to offer you every assignment that is available.
3.2 You may accept or decline any assignment offered to you. Declining an assignment will not be held against you.
3.3 Once you have accepted an assignment, VERGO and the hirer rely on you to attend. If you can no longer attend, tell VERGO as soon as possible (see clause 12).

## 4. Assignments
4.1 Before you accept an assignment VERGO will tell you the hirer, the date, the expected hours and duration, the location, the role and the rate of pay. VERGO will send you an Assignment Confirmation with the full details, including any health and safety risks and the steps taken to control them.
4.2 An assignment may be changed or cancelled by VERGO or the hirer. VERGO will tell you as soon as it can.
4.3 The end of an assignment, for any reason, does not by itself end your employment with VERGO.

## 5. Place of work
5.1 You have no fixed place of work. Assignments take place at venues, hotels, private residences, event spaces, catering sites and other client locations, mainly in London and the surrounding areas.
5.2 VERGO's address is {{company.registeredOffice}}.

## 6. Hours of work
6.1 Your working hours vary by assignment and are set out in each Assignment Confirmation. Assignments may include evenings, nights, weekends and bank holidays.
6.2 You are entitled to the rest breaks, daily rest and weekly rest set by the Working Time Regulations 1998. Break arrangements for an assignment are set out in its Assignment Confirmation.
6.3 Your average working time should not exceed 48 hours a week. If you choose to opt out of that limit, it must be in a separate written agreement that is entirely voluntary. You will not be treated unfavourably for refusing to sign one, and you may cancel it by giving notice.

## 7. Pay
7.1 Your rate of pay can vary by assignment. You will be told the rate before you accept an assignment, and it is confirmed in the Assignment Confirmation.
7.2 Your pay will never be below the National Minimum Wage or National Living Wage that legally applies to you.
7.3 VERGO pays you for the hours you genuinely work, whether or not the hirer has paid VERGO.
7.4 You will normally be paid monthly in arrears on the last working day of each calendar month, by bank transfer, for the hours worked and submitted for that pay period.
7.5 VERGO deducts Income Tax and National Insurance through PAYE, and any other deductions it is required or permitted by law to make, as listed in your Key Information Document. You will receive a payslip each pay period.
7.6 VERGO may, at its discretion, consider a request for early payment or an advance in exceptional circumstances. You have no entitlement to early payment or to an advance.
7.7 If you are overpaid by mistake, VERGO may recover the overpayment from later pay where the law allows, and will tell you before doing so.

## 8. Timesheets
8.1 You must record the hours you actually work accurately using VERGO's timesheet process (for example by checking in and out in the VERGO app), including the times of unpaid breaks.
8.2 Hours may be confirmed with the hirer. Deliberately submitting false hours is gross misconduct.

## 9. Holiday
9.1 You are entitled to paid statutory holiday under the Working Time Regulations 1998. As an irregular-hours worker your entitlement builds up at 12.07% of the hours you work in each pay period. The holiday year runs from 1 January to 31 December.
9.2 Where the law allows it for irregular-hours workers, VERGO may pay your holiday pay as rolled-up holiday pay: 12.07% of your pay, paid with your wages and shown as a separate line on your payslip. Where it does, holiday pay is not paid again when you take the time off.
9.3 Where rolled-up holiday pay is not used, holiday pay is paid when you take holiday, calculated as the law requires.
9.4 Please give VERGO at least twice as much notice as the length of holiday you want to take. You should take time off to rest, and can do so by telling VERGO you are not available.
9.5 There is no extra entitlement for bank holidays beyond your statutory entitlement.

## 10. Pension
VERGO will assess you under the workplace pension automatic-enrolment rules and will enrol you, or tell you your right to join or opt in, as the law requires. Details of the scheme will be given to you in writing.

## 11. Travel, expenses, dress and equipment
11.1 Normal travel between home and an assignment is your own responsibility, unless VERGO tells you otherwise for an assignment.
11.2 Expenses are paid only where VERGO agrees them in advance in the Assignment Confirmation, against receipts where requested.
11.3 The dress code and any equipment needed vary by assignment and will be told to you before the assignment.

## 12. Absence
12.1 If illness or an emergency prevents you attending an assignment you have accepted, tell VERGO as soon as reasonably possible, and in any case before the start time where you can, by phone on {{company.phone}}.
12.2 There is no contractual sick pay. You will receive Statutory Sick Pay where you qualify for it.
12.3 You may be entitled to statutory family leave and pay and time off for dependants, in line with the law.

## 13. Conduct
While working for VERGO you must:
- behave professionally and courteously to hirers, guests, colleagues and the public
- follow the lawful and reasonable instructions of VERGO and of the hirer
- treat everyone with respect, without harassment or discrimination
- keep confidential information confidential (clause 17)
- follow health and safety rules (clause 15)
- not attend work under the influence of alcohol or illegal drugs, or with your ability impaired by them, and not drink alcohol while working unless the hirer expressly permits it as part of the role
- arrive on time, appropriately dressed, and not leave an assignment early without agreement
- not accept direct payment or employment from a hirer without telling VERGO

## 14. Right to work
Your employment is conditional on VERGO being satisfied that you have the legal right to do the work, and on you completing any follow-up right-to-work checks VERGO needs to make. You must tell VERGO immediately if your right to work changes. VERGO cannot offer you work, and may need to end your employment, if you no longer have the right to work.

## 15. Health and safety
15.1 You must follow lawful site safety requirements, use any equipment and protective clothing provided as instructed, and take reasonable care of yourself and others.
15.2 You must report hazards, accidents and incidents to the hirer's on-site contact and to VERGO.
15.3 If you have a serious safety concern, or are asked to do something you believe is unsafe, contact VERGO straight away on {{company.phone}}.

## 16. Data protection
VERGO processes your personal data for employment, recruitment, payroll, legal compliance (including right-to-work checks) and its legitimate business purposes, as described in the VERGO privacy notice at {{company.privacyUrl}}. A hirer receives only the information it needs for the assignment.

## 17. Confidentiality
You must keep confidential, during and after your employment, any confidential information about VERGO, its hirers, their guests and private events, and VERGO's commercial information (such as rates, clients and business plans). Do not post photographs or details of private events or guests on social media without permission. This does not stop you making a protected disclosure or reporting a concern to a regulator or the police.

## 18. Other work
You are free to work for others when you are not on a VERGO assignment, provided this does not conflict with an assignment you have already accepted and does not involve a genuine conflict of interest. VERGO does not restrict you from working elsewhere.

## 19. Initial review period
The first three months of your employment are an initial review period. VERGO may extend it where you have completed very few assignments in that time, and will tell you in writing if it does. Your notice entitlements during this period are set out in clause 21.

## 20. Training, discipline and grievances
20.1 There is no compulsory training that you must pay for. Where an assignment needs a qualification or training, this is set out in the Assignment Confirmation.
20.2 VERGO's disciplinary rules are the conduct standards in this agreement. VERGO will follow a fair procedure in line with the Acas Code of Practice before taking disciplinary action.
20.3 If you have a grievance or wish to appeal a disciplinary decision, write to VERGO at {{company.email}}. It will be dealt with fairly and without delay.
20.4 No collective agreement affects your terms of employment.

## 21. Ending your employment
21.1 During your first month of employment, either party may end your employment without notice, subject to your statutory rights.
21.2 After one month's continuous employment, you must give VERGO at least one week's notice in writing.
21.3 After one month's continuous employment, VERGO will give you the notice set by law: one week's notice, rising to one week for each complete year of continuous employment after two years, up to twelve weeks. Any longer notice VERGO agrees with you in writing will apply instead.
21.4 VERGO may end your employment without notice for gross misconduct, where the law allows it, after following a fair procedure.
21.5 The end of an assignment does not by itself end your employment.

## 22. Changes to this agreement
Any material change to your terms will be agreed with you or notified to you in writing, and recorded as a new version of this agreement or a written statement of the change.

## 23. Governing law
This agreement is governed by the law of England and Wales, and the courts of England and Wales have jurisdiction.

## Agreement
Agreed electronically by the worker typing their full name and confirming they have read and agree to this agreement. This is an electronic agreement, not a qualified electronic signature. The date and time of agreement are recorded with this version.
`;

export const ASSIGNMENT_CONFIRMATION_BODY = `# Assignment confirmation

Worker: {{worker.name}}
VERGO reference: {{assignment.reference}}
Issued: {{today}} (template version {{doc.version}})

This confirms the details of an assignment you have accepted under your VERGO Zero-Hours Employment Agreement. You are employed and paid by {{company.legalName}}, not by the hirer.

## The hirer
{{assignment.client}}
Nature of the hirer's business: {{assignment.clientBusiness}}

## When and where
Date: {{assignment.date}}
Start: {{assignment.start}}
Planned finish: {{assignment.finish}}
Expected duration: {{assignment.duration}}
Breaks: {{assignment.breaks}}
Venue: {{assignment.venue}}
Address: {{assignment.address}}
On-site contact: {{assignment.onSiteContact}}

## The work
Position: {{assignment.role}}
Duties: {{assignment.duties}}
Experience or training required: {{assignment.experience}}
Qualifications required: {{assignment.qualifications}}
Dress code: {{assignment.dressCode}}
Equipment: {{assignment.equipment}}

## Pay
Hourly rate: {{assignment.payRate}}
Holiday pay: {{assignment.holidayMethod}}
Travel: {{assignment.travel}}
Expenses: {{assignment.expenses}}
Paid by {{company.legalName}} on the normal monthly payday for the hours you work and record.

## Health and safety
Known risks: {{assignment.risks}}
Steps taken to control them: {{assignment.riskControls}}
Report hazards and incidents to the on-site contact and to VERGO. If you have a serious safety concern, call VERGO straight away.

## VERGO contact
{{company.tradingName}}: {{company.phone}}, {{company.email}}. If you cannot attend, tell VERGO as soon as possible.
`;

export const CLIENT_TERMS_BODY = `# VERGO STAFFING
# TERMS OF BUSINESS FOR TEMPORARY STAFF SUPPLY

For business hirers only. These Terms are not used for private individuals booking staff for household or private events, who are offered separate consumer booking terms.

Terms version {{doc.version}}, effective {{doc.effectiveDate}}. Issued {{today}}.

## 1. The parties
1.1 {{company.legalName}} trading as {{company.tradingName}}, company number {{company.number}}, registered office {{company.registeredOffice}} ("VERGO").
1.2 The business named in the Booking Confirmation or acceptance record of these Terms (the "Client"): {{client.legalName}}.

## 2. Definitions
In these Terms: "Assignment" means a period during which a Worker is supplied to work temporarily for the Client; "Booking" means the Client's request for Workers for one or more Assignments; "Booking Confirmation" means VERGO's written or electronic acceptance of a Booking, including its Charges; "Charges" means the amounts payable by the Client for a Booking; "Worker" means a person employed by VERGO and supplied to the Client; "Engagement" means the Client employing or engaging a Worker directly or through anyone other than VERGO; "Relevant Period" has the meaning in clause 15.

## 3. VERGO's role
3.1 VERGO acts as an employment business under the Conduct of Employment Agencies and Employment Businesses Regulations 2003. It supplies Workers to work temporarily under the Client's supervision and direction.
3.2 Workers are employed and paid by VERGO, which is responsible for their pay, PAYE Income Tax and National Insurance, holiday pay and pension duties, unless expressly agreed otherwise in writing.
3.3 These Terms apply to every Booking to the exclusion of any other terms the Client puts forward. They are accepted by the Client's electronic acceptance, by its signature, or by it requesting or using a Worker after receiving them.

## 4. Booking information
4.1 To make a Booking, the Client must give VERGO enough information for VERGO to select suitable Workers and meet its legal duties, including:
- the Client's identity and business, and the nature of that business
- the location of the work
- the date the work starts and its anticipated duration
- the working hours
- the position and the duties
- the experience, training, qualifications and any authorisation required by law or by a professional body
- any risks to health and safety known to the Client, and the steps it has taken to prevent or control them
- any expenses payable by or to the Worker
- the dress code and any equipment the Worker must bring or will be given
- an on-site contact
4.2 The Client must tell VERGO promptly of any change to this information.

## 5. Booking confirmation
5.1 A Booking becomes confirmed only when VERGO accepts it in writing or electronically by issuing a Booking Confirmation. Quotes and estimates are not Bookings.
5.2 The Booking Confirmation sets out the Charges for that Booking.

## 6. Charges
6.1 The Charges are those in the Booking Confirmation. They may include: the hourly charge rate for each role; a minimum number of chargeable hours per Worker per shift; an overtime rate and when it applies; an uplift for hours worked after midnight; specialist rates; travel, expenses and any other agreed charges.
6.2 Charges are for the hours actually worked by each Worker, subject to any minimum hours in the Booking Confirmation. VAT is added where applicable.
6.3 VERGO's published prices are a guide. The Booking Confirmation prevails.

## 7. Timesheets
7.1 The Client must verify the hours each Worker works, by approving the timesheet or check-in and check-out record VERGO provides, promptly after each shift.
7.2 If the Client believes the hours are wrong it must tell VERGO within 48 hours of the shift, with reasons. VERGO will investigate genuine disputes in good faith.
7.3 Hours genuinely worked remain payable even if a timesheet has not been approved. The Client's failure to approve a timesheet does not relieve it of the obligation to pay for hours worked.

## 8. Payment
8.1 Invoices are payable within {{terms.paymentDays}} days of the invoice date, unless the Booking Confirmation says otherwise.
8.2 {{terms.advancePaymentLine}}
8.3 If the Client pays late, VERGO may charge interest and compensation under the Late Payment of Commercial Debts (Interest) Act 1998 where it applies, and may suspend further supply until overdue amounts are paid.
8.4 The Client may not withhold or set off any amount except a genuinely disputed amount notified under clause 7.2.

## 9. Cancellation
9.1 If the Client cancels a confirmed Booking, or reduces the number of Workers or hours, the following cancellation charges apply, as a percentage of the Charges for the cancelled shifts:
{{terms.cancellationList}}
9.2 The notice period is measured to the start time of the shift. Cancellation must be by email or phone to VERGO.
9.3 These charges are a genuine pre-estimate of VERGO's loss, including wages it may still owe to Workers.

## 10. No-show and replacement
10.1 If a Worker does not arrive for a confirmed shift, VERGO will use reasonable endeavours to provide a replacement on site within {{terms.replacementWindow}} of being told.
10.2 The Client is not charged for time no Worker worked. If no replacement is provided, there is no charge for that Worker's shift.
10.3 This is the Client's sole remedy for a Worker not arriving, and VERGO's liability for it is limited as set out in clause 20.

## 11. The Client's responsibilities
11.1 Workers work under the Client's supervision, direction and control. The Client is responsible for:
- the workplace and any site under its control
- providing safe systems of work
- giving site-specific induction, instructions and information
- providing appropriate equipment and personal protective equipment where it is needed
- providing welfare facilities (toilets, drinking water and somewhere to take breaks)
- following lawful working practices, including the rules on working time
- allowing Workers the breaks and rest the law requires
11.2 The Client must not ask a Worker to do work outside the Booking, or work that needs a qualification or licence the Worker does not hold, without VERGO's agreement.

## 12. Health and safety
12.1 Before an Assignment starts, the Client must tell VERGO of any risks to health and safety known to it and the steps taken to prevent or control them, and must update VERGO if they change.
12.2 The Client must report any accident, injury or dangerous occurrence involving a Worker to VERGO promptly.

## 13. Agency Workers Regulations
13.1 Workers may be entitled to rights under the Agency Workers Regulations 2010, including access to collective facilities and information about vacancies from their first day, and equal basic working and employment conditions after a 12-week qualifying period.
13.2 The Client must cooperate with VERGO's reasonable requests for information, and provide it promptly, about: the basic working and employment conditions of comparable employees; collective facilities and amenities; relevant vacancies; and the periods Workers have worked for the Client in the same role, including through other agencies, so that the qualifying period can be assessed.
13.3 The Client must give Workers access to collective facilities and amenities, and to information about relevant vacancies, as the Regulations require.

## 14. Worker suitability and complaints
14.1 VERGO takes reasonable steps to match Workers to the requirements the Client supplies, and to confirm that each Worker has the experience, training and qualifications the Client has told VERGO are required.
14.2 The Client is responsible for identifying any mandatory qualification, licence or experience for the work.
14.3 If the Client is dissatisfied with a Worker, or has a concern about conduct, it must tell VERGO promptly. VERGO will investigate and, where appropriate, replace the Worker. The Client may ask that a Worker is not supplied again.
14.4 The Client must not treat a Worker as its own employee for disciplinary purposes. Disciplinary matters are for VERGO as employer.

## 15. Direct engagement and transfer fees
15.1 The Relevant Period is the later of: 14 weeks from the first day on which the Worker worked for the Client in the period of supply; and 8 weeks from the day after the last day on which the Worker worked for the Client.
15.2 If, during the Relevant Period, the Client (or anyone it introduces the Worker to) Engages a Worker supplied by VERGO, the Client must pay VERGO a transfer fee of {{terms.transferFeePercent}} of the Worker's anticipated gross remuneration for the first {{terms.transferFeeMonths}} months of the Engagement, plus VAT.
15.3 Instead of paying a transfer fee, the Client may choose an extended period of hire: VERGO continues to supply the Worker for {{terms.extendedHireWeeks}} weeks on the terms of the current Booking, after which the Client may Engage the Worker without a fee. The Client must tell VERGO in writing which option it chooses before the Engagement starts. If it does not, the transfer fee applies.
15.4 If VERGO cannot supply the Worker for the extended period of hire, no transfer fee is payable for that Worker.
15.5 No transfer fee is payable for an Engagement that begins after the Relevant Period has ended, or in any other circumstance in which the Conduct of Employment Agencies and Employment Businesses Regulations 2003 do not permit one.
15.6 The Client must tell VERGO promptly if it Engages, or intends to Engage, a Worker.

## 16. Confidentiality and data protection
16.1 Each party will keep the other's confidential information confidential, and use it only for the Booking.
16.2 VERGO gives the Client only the personal data about a Worker that is genuinely needed for the Assignment (such as name, role and contact arrangements). VERGO will not give the Client a Worker's payroll details, National Insurance number, passport or right-to-work documents, or bank details.
16.3 Each party will comply with data protection law in respect of personal data it receives, use it only for the Assignment, keep it secure, and not keep it longer than needed.

## 17. Insurance
17.1 VERGO maintains employers' liability insurance and public liability insurance appropriate to its declared activities.
17.2 The Client must maintain the insurance appropriate to its own business and premises, including public liability insurance.

## 18. Non-solicitation of VERGO's staff
The Client must not encourage a Worker to work for it other than through VERGO during an Assignment, except as allowed by clause 15.

## 19. Force majeure
Neither party is liable for a delay or failure to perform caused by events beyond its reasonable control, such as severe weather, transport failure, pandemic restrictions, or action by a public authority. The affected party must tell the other promptly and do what it reasonably can to reduce the effect. Charges for hours actually worked remain payable.

## 20. Limitation of liability
20.1 Nothing in these Terms limits or excludes liability for death or personal injury caused by negligence, for fraud or fraudulent misrepresentation, or any other liability that cannot be limited or excluded by law.
20.2 Subject to clause 20.1, neither party is liable for any loss of profit, loss of business or indirect or consequential loss.
20.3 Subject to clause 20.1, VERGO's total liability arising from or in connection with a Booking is limited to the Charges paid or payable for that Booking.
20.4 Workers work under the Client's supervision and direction. Subject to clause 20.1, VERGO is not liable for loss caused by a Worker's acts or omissions while working under the Client's control, except to the extent the loss is caused by VERGO's own negligence or breach of these Terms.

## 21. General
21.1 VERGO may update these Terms by issuing a new version. A new version applies to Bookings confirmed after the Client accepts it.
21.2 If any part of these Terms is found unenforceable, the rest continues in force.
21.3 These Terms, the Booking Confirmation and anything they refer to are the whole agreement for a Booking. A variation must be in writing.

## 22. Governing law
These Terms are governed by the law of England and Wales, and the courts of England and Wales have exclusive jurisdiction.

## Acceptance
Accepted electronically by a person authorised by the Client, who confirms: "I confirm that I am authorised to accept these Terms of Business on behalf of the hirer and agree to the VERGO Staffing Terms of Business for Temporary Staff Supply." This is an electronic acceptance, not a qualified electronic signature. The name, job title, date and time of acceptance are recorded with this version.
`;
