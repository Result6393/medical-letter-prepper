// Built-in stock phrases, clinic lists and pick-lists. Generic wording only: no real names.
//
// Phrase tokens (filled in by letter.ts):
//   {pt}  patient as chosen (Mr Smith / first name / this patient)   {reason}  reason for review
//   {he} {his} {him} {himself}  pronouns        {is} {has} {does} {was}  verbs that change for "they"
//   {s}  adds "s" for he/she, nothing for they   {eye}  right eye / left eye / both eyes
//   {review} {reviewtime}  e.g. "6 months" / "6 months' time"     {vaRE} {vaLE} {dob}
// A capital first letter ({He}, {Pt}) capitalises the result. Anything in [square brackets]
// stays in the letter, highlighted, for you to fill in.

export type ClinicId = 'general' | 'uveitis' | 'glaucoma' | 'cornea' | 'neuro' | 'retina';
export type LetterType = 'review' | 'discharge' | 'referral' | 'support';

export const CLINICS: { id: ClinicId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'uveitis', label: 'Uveitis' },
  { id: 'glaucoma', label: 'Glaucoma' },
  { id: 'cornea', label: 'Cornea' },
  { id: 'neuro', label: 'Neuro-ophthalmology' },
  { id: 'retina', label: 'Retina' },
];

export const LETTER_TYPES: { id: LetterType; label: string; blurb: string }[] = [
  { id: 'review', label: 'Routine review', blurb: 'Update after a clinic visit' },
  { id: 'discharge', label: 'Discharge', blurb: 'No further follow-up needed' },
  { id: 'referral', label: 'Referral / request', blurb: 'Asking another service to see or help' },
  { id: 'support', label: 'Support / status', blurb: 'NDIS, driving, work, blindness, carer' },
];

export interface SectionDef {
  id: string;
  label: string;
  /** Sections sharing a number are joined into one paragraph. */
  para: number;
  hint: string;
}

export const SECTIONS: Record<LetterType, SectionDef[]> = {
  review: [
    { id: 'open', label: 'Opening', para: 1, hint: 'Anything extra about the visit' },
    { id: 'status', label: 'Findings', para: 1, hint: 'Case-specific findings' },
    { id: 'plan', label: 'Treatment', para: 2, hint: 'Drug changes, requests for the GP' },
    { id: 'fu', label: 'Follow-up', para: 2, hint: 'Anything else about follow-up' },
  ],
  discharge: [
    { id: 'open', label: 'Opening', para: 1, hint: '' },
    { id: 'status', label: 'Findings', para: 1, hint: 'Case-specific findings' },
    { id: 'dc', label: 'Discharge', para: 2, hint: '' },
    { id: 'advice', label: 'Advice', para: 2, hint: 'Who should follow up, and when' },
  ],
  referral: [
    { id: 'open', label: 'Opening', para: 1, hint: '' },
    { id: 'bg', label: 'Background', para: 1, hint: 'Presentation, results, history' },
    { id: 'req', label: 'Request', para: 2, hint: 'What you want them to do' },
    { id: 'urg', label: 'Urgency and attachments', para: 2, hint: 'Timeframe, availability, reports attached' },
  ],
  support: [
    { id: 'open', label: 'Opening', para: 1, hint: '' },
    { id: 'vision', label: 'Vision', para: 1, hint: 'Acuity, fields, prognosis' },
    { id: 'impact', label: 'Impact', para: 2, hint: 'Effect on daily life, work, driving' },
    { id: 'req', label: 'Request / statement', para: 2, hint: 'What is being supported' },
    { id: 'close', label: 'Closing', para: 3, hint: '' },
  ],
};

export interface Phrase {
  id: string;
  type: LetterType;
  section: string;
  /** Omitted = shown in every clinic. */
  clinics?: ClinicId[];
  text: string;
  /** True for phrases the user added in settings. */
  custom?: boolean;
}

const p = (id: string, type: LetterType, section: string, text: string, clinics?: ClinicId[]): Phrase => ({
  id,
  type,
  section,
  text,
  ...(clinics ? { clinics } : {}),
});

export const DEFAULT_PHRASES: Phrase[] = [
  // ---------- Routine review ----------
  p('rv-o1', 'review', 'open', 'Thank you for your ongoing care of {pt}. We reviewed {him} today for {reason}.'),
  p('rv-o2', 'review', 'open', 'Thank you for referring {pt} for assessment of {reason}.'),
  p('rv-o3', 'review', 'open', 'We reviewed {pt} today for {reason}.'),

  p('rv-s1', 'review', 'status', '{His} condition appears inactive and stable.'),
  p('rv-s2', 'review', 'status', '{He} report{s} no changes.'),
  p('rv-s3', 'review', 'status', 'It was essentially a normal examination of the {eye}.'),
  p('rv-s4', 'review', 'status', 'It was a stable examination of the {eye}.'),
  p('rv-s5', 'review', 'status', '{He} had a completely normal eye examination today.'),
  p('rv-s6', 'review', 'status', 'Visual acuity is stable.'),
  p('rv-s7', 'review', 'status', 'Visual acuity has improved.'),
  p('rv-s8', 'review', 'status', 'Visual acuity has declined.'),
  p('rv-s9', 'review', 'status', '{His} condition has improved since the last visit.'),
  p('rv-s10', 'review', 'status', '{His} condition has deteriorated since the last visit.'),
  p('rv-s11', 'review', 'status', '{He} report{s} ongoing poor vision in the {eye}.'),
  p('rv-s12', 'review', 'status', 'There has been slow and gradual progression in {his} condition, in keeping with its natural history.'),
  p('rv-s13', 'review', 'status', 'There were no signs of active inflammation.', ['uveitis']),
  p('rv-s14', 'review', 'status', '{His} inflammation is well controlled on {his} current treatment.', ['uveitis']),
  p('rv-s15', 'review', 'status', 'The intraocular pressure is well controlled.', ['glaucoma']),
  p('rv-s16', 'review', 'status', 'The intraocular pressure is above target.', ['glaucoma']),
  p('rv-s17', 'review', 'status', 'The optic nerves and visual fields are stable.', ['glaucoma']),
  p('rv-s18', 'review', 'status', 'There were no signs of active infection.', ['cornea']),
  p('rv-s19', 'review', 'status', 'The corneal graft is clear and stable.', ['cornea']),
  p('rv-s20', 'review', 'status', 'The central haze is improving, but not yet resolved.', ['cornea']),
  p('rv-s21', 'review', 'status', 'The optic discs have completely normalised.', ['neuro']),
  p('rv-s22', 'review', 'status', 'There were no defects on visual field testing.', ['neuro']),
  p('rv-s23', 'review', 'status', 'We were not able to perform visual field testing today.', ['neuro']),
  p('rv-s24', 'review', 'status', 'There were no signs of neovascularisation.', ['retina']),
  p('rv-s25', 'review', 'status', 'There was no macular oedema on OCT.', ['retina']),
  p('rv-s26', 'review', 'status', 'The macula is stable on OCT.', ['retina']),

  p('rv-p1', 'review', 'plan', '{He} should continue {his} current drops unchanged.'),
  p('rv-p2', 'review', 'plan', '{He} should continue {his} current medications.'),
  p('rv-p3', 'review', 'plan', 'We have made no changes to {his} treatment.'),
  p('rv-p4', 'review', 'plan', 'We have changed {his} treatment as above.'),
  p('rv-p5', 'review', 'plan', 'We have restarted {his} treatment as above.'),
  p('rv-p6', 'review', 'plan', 'We have stopped {his} drops.'),
  p(
    'rv-p7',
    'review',
    'plan',
    '{He} should continue {his} immunosuppression, for which {he} need{s} 3 monthly blood tests (FBC, EUC, LFT). Your assistance in facilitating this is greatly appreciated.',
    ['uveitis'],
  ),
  p('rv-p8', 'review', 'plan', 'We are happy for you to adjust the dose of {his} immunosuppression if the eyes remain inactive.', ['uveitis']),
  p('rv-p9', 'review', 'plan', 'Cataract surgery can be arranged once the inflammation has been controlled for at least 3 months.', ['uveitis']),
  p('rv-p10', 'review', 'plan', '{He} {is} already on maximal medical therapy.', ['glaucoma']),
  p('rv-p11', 'review', 'plan', '{He} should avoid contact lens wear.', ['cornea']),
  p('rv-p12', 'review', 'plan', 'We have changed to preservative free drops.', ['cornea']),

  p('rv-f1', 'review', 'fu', 'We will review {him} in {reviewtime}.'),
  p('rv-f2', 'review', 'fu', 'We will see {him} again in {reviewtime}.'),
  p('rv-f3', 'review', 'fu', 'We will review {him} in {reviewtime}, with visual field testing and OCT.', ['glaucoma', 'neuro']),
  p('rv-f4', 'review', 'fu', 'We are happy to see {him} sooner if any new issues arise.'),
  p('rv-f5', 'review', 'fu', 'Please do not hesitate to contact us if you have any concerns.'),

  // ---------- Discharge ----------
  p('dc-o1', 'discharge', 'open', 'Thank you for your ongoing care of {pt}, who we reviewed today for {reason}.'),
  p('dc-o2', 'discharge', 'open', 'Thank you for referring {pt} for assessment of {reason}.'),
  p('dc-o3', 'discharge', 'open', 'Thank you for your ongoing care of {pt}. We have been reviewing {him} since [year] for {reason}.'),

  p('dc-s1', 'discharge', 'status', '{He} had a completely normal eye examination today.'),
  p('dc-s2', 'discharge', 'status', '{His} condition appears inactive and stable. {He} report{s} no changes.'),
  p('dc-s3', 'discharge', 'status', '{His} eyes have been quiescent for several years.'),
  p('dc-s4', 'discharge', 'status', 'Visual acuity and visual fields are normal.'),
  p('dc-s5', 'discharge', 'status', '{His} symptoms have completely resolved.'),
  p('dc-s6', 'discharge', 'status', '{His} symptoms resolved with the treatment under your care.'),

  p('dc-d1', 'discharge', 'dc', 'We have no further plans to see {him} in our clinic.'),
  p('dc-d2', 'discharge', 'dc', 'We have no further plans to see {him} again but are always happy to if any new issues arise.'),
  p('dc-d3', 'discharge', 'dc', 'There is no need for further ophthalmology review.'),
  p('dc-d4', 'discharge', 'dc', 'We are discharging {him} from our clinic to you for routine annual reviews.'),
  p('dc-d5', 'discharge', 'dc', 'We can see {him} again if there are any concerns.'),

  p('dc-a1', 'discharge', 'advice', 'We suggest an annual review with {his} local optometrist.'),
  p('dc-a2', 'discharge', 'advice', 'We recommend an annual review of the optic discs with {his} local optometrist.', ['neuro']),
  p('dc-a3', 'discharge', 'advice', 'Please re-refer {him} if any new symptoms develop.'),
  p('dc-a4', 'discharge', 'advice', '{He} {has} been advised to seek urgent review if {his} vision changes.'),

  // ---------- Referral / request ----------
  p('rf-o1', 'referral', 'open', 'Thank you for seeing {pt}, who we reviewed today for {reason}.'),
  p('rf-o2', 'referral', 'open', 'We would be grateful for your assessment of {pt}, who we reviewed today for {reason}.'),
  p('rf-o3', 'referral', 'open', 'Thank you for seeing {pt}.'),

  p('rf-b1', 'referral', 'bg', '{He} initially presented to us on [date] with [symptoms].'),
  p('rf-b2', 'referral', 'bg', '{His} examination and investigations are summarised above.'),
  p('rf-b3', 'referral', 'bg', '{His} vision is {vaRE} in the right eye and {vaLE} in the left eye.'),
  p('rf-b4', 'referral', 'bg', 'Over the past [period], {his} symptoms have improved.'),

  p('rf-r1', 'referral', 'req', 'Could you please assist with [request]?'),
  p('rf-r2', 'referral', 'req', 'We would be grateful for your assessment and management.'),
  p('rf-r3', 'referral', 'req', 'We would appreciate your opinion regarding [question].'),
  p('rf-r4', 'referral', 'req', 'We have asked {him} to have [investigation] prior to seeing you.'),

  p('rf-u1', 'referral', 'urg', 'It would be greatly appreciated if {he} could be seen within the next [timeframe].'),
  p('rf-u2', 'referral', 'urg', 'This is not urgent.'),
  p('rf-u3', 'referral', 'urg', 'This is urgent and we would be grateful for review as soon as possible.'),
  p('rf-u4', 'referral', 'urg', 'The relevant report is attached.'),
  p('rf-u5', 'referral', 'urg', 'Please contact us if further information is required.'),

  // ---------- Support / status ----------
  p('su-o1', 'support', 'open', '{Pt} (DOB {dob}) is under our care for {reason}.'),
  p('su-o2', 'support', 'open', 'I am writing in support of {pt}, who is under our care for {reason}.'),
  p('su-o3', 'support', 'open', 'We reviewed {pt} today for {reason}.'),

  p('su-v1', 'support', 'vision', '{His} vision is {vaRE} in the right eye and {vaLE} in the left eye.'),
  p('su-v2', 'support', 'vision', '{He} {is} legally blind.'),
  p('su-v3', 'support', 'vision', 'This meets the definition for low vision.'),
  p('su-v4', 'support', 'vision', 'This vision loss is permanent.'),
  p('su-v5', 'support', 'vision', 'There is no treatment available to regain vision. Supportive measures only.'),
  p('su-v6', 'support', 'vision', 'There is no expectation of improvement in vision.'),
  p('su-v7', 'support', 'vision', '{His} vision is stable.'),
  p('su-v8', 'support', 'vision', '{He} meet{s} the vision requirements for a private drivers licence.'),
  p('su-v9', 'support', 'vision', 'There are no defects on the Binocular Esterman field test, and the visual acuities are excellent.'),
  p('su-v10', 'support', 'vision', '{He} {does} not meet the vision requirements for a private drivers licence.'),

  p('su-i1', 'support', 'impact', '{His} vision has a significant impact on {his} ability to work or care for {himself} and others.'),
  p('su-i2', 'support', 'impact', '{He} cannot read menus, signs or labels, and {has} difficulty navigating safely.'),
  p('su-i3', 'support', 'impact', '{His} vision has minimal impact on {his} lifestyle.'),
  p('su-i4', 'support', 'impact', '{He} will need support at home and will not be independent during {his} recovery.'),
  p('su-i5', 'support', 'impact', 'There will be a lengthy recovery period, possibly [duration], possibly longer.'),
  p('su-i6', 'support', 'impact', '{He} {is} able to return to normal work duties.'),
  p('su-i7', 'support', 'impact', '{He} {is} not fit for work at this time.'),

  p('su-r1', 'support', 'req', 'I am writing to request support in obtaining [item].'),
  p('su-r2', 'support', 'req', 'This would allow {him} to participate in the community safely and independently.'),
  p('su-r3', 'support', 'req', 'I consider this a reasonable and necessary support.'),
  p('su-r4', 'support', 'req', '{He} will require [procedure] within the next [timeframe].'),

  p('su-c1', 'support', 'close', 'I strongly endorse this request.'),
  p('su-c2', 'support', 'close', 'Please contact me if further information is required.'),
  p('su-c3', 'support', 'close', 'We do not need to see {him} again.'),
];

// ---------- Pick-lists ----------

export const VA_OPTIONS = [
  '6/4', '6/5', '6/6', '6/7.5', '6/9', '6/12', '6/15', '6/18', '6/24', '6/36', '6/60', '6/120', '6/180', 'CF', 'HM', 'PL', 'LP', 'NLP',
];

export const FREQUENCIES = ['daily', 'mane', 'nocte', 'BD', 'TDS', 'QID', 'PRN', 'weekly', 'hourly', '2x/day', 'tapering'];
export const EYES = ['RE', 'LE', 'OU'];

export interface IntervalOption {
  id: string;
  label: string;
  /** Plan line text. */
  plan: string;
  /** Interval used by {review}; absent for non-interval choices. */
  review?: string;
}

const months = (n: number): IntervalOption => ({
  id: `${n}m`,
  label: n === 12 ? '12 months' : `${n} month${n === 1 ? '' : 's'}`,
  plan: `Review in ${n} month${n === 1 ? '' : 's'}`,
  review: `${n} month${n === 1 ? '' : 's'}`,
});

export const INTERVALS: IntervalOption[] = [
  { id: '1w', label: '1 week', plan: 'Review in 1 week', review: '1 week' },
  { id: '2w', label: '2 weeks', plan: 'Review in 2 weeks', review: '2 weeks' },
  { id: '4w', label: '4 weeks', plan: 'Review in 4 weeks', review: '4 weeks' },
  months(2),
  months(3),
  months(4),
  months(6),
  months(9),
  months(12),
  { id: '24m', label: '2 years', plan: 'Review in 2 years', review: '2 years' },
  { id: 'dc', label: 'Discharge from clinic', plan: 'Discharge from clinic' },
  { id: 'dc-opt', label: 'Discharge to optometrist', plan: 'Discharge to optometrist for routine review' },
  { id: 'dc-gp', label: 'Discharge to GP', plan: 'Discharge to GP' },
  { id: 'none', label: 'No plan line (use extra text)', plan: '' },
];

/** Suggestions only: the drug box accepts anything. */
export const DRUGS: Record<ClinicId, string[]> = {
  general: ['Systane', 'Hylo Forte', 'Chlorsig', 'Lacri-Lube', 'Predsol minims', 'Prednefrin Forte'],
  uveitis: ['Predsol minims', 'Prednefrin Forte', 'Maxidex', 'Atropine 1%', 'Cyclopentolate 1%', 'Mycophenolate', 'Methotrexate', 'Azathioprine', 'Adalimumab', 'Valtrex 500mg'],
  glaucoma: ['Xalatan', 'Lumigan', 'Lumigan PF', 'Timolol', 'Combigan', 'Cosopt', 'Azopt', 'Simbrinza', 'Cosdor', 'Diamox 250mg', 'Pilocarpine 2%', 'Maxidex'],
  cornea: ['Systane', 'Hylo Forte', 'Cellufresh', 'Polyvisc', 'Predsol minims', 'Prednefrin Forte', 'Vitapos ointment', 'Chlorsig', 'Doxycycline 50mg', 'Valtrex 500mg'],
  neuro: ['Diamox 250mg', 'Prednisolone'],
  retina: ['Systane', 'Lumigan'],
};

/** Suggestions for the Diagnosis box. */
export const DIAGNOSES: Record<ClinicId, string[]> = {
  general: [],
  uveitis: ['Idiopathic anterior uveitis', 'HLA-B27 associated anterior uveitis', 'Birdshot chorioretinitis', 'Intermediate uveitis', 'Scleritis', 'Fuchs heterochromic iridocyclitis'],
  glaucoma: ['Primary open angle glaucoma', 'Normal tension glaucoma', 'Primary angle closure glaucoma', 'Pseudoexfoliation glaucoma', 'Ocular hypertension', 'Juvenile glaucoma'],
  cornea: ['Keratoconus', 'Fuchs endothelial dystrophy', 'Herpes simplex keratitis', 'Corneal graft', 'Microbial keratitis', 'Dry eye disease'],
  neuro: ['Idiopathic intracranial hypertension', 'Optic neuritis', 'Pseudo-papilloedema', 'Cranial nerve palsy', 'Homonymous hemianopia'],
  retina: ['Macular telangiectasia', 'Central serous chorioretinopathy', 'Retinal vein occlusion', 'Diabetic retinopathy', 'Epiretinal membrane', 'Retinal dystrophy'],
};

export const TITLES = ['Mr', 'Ms', 'Mrs', 'Miss', 'Mx', 'Master', 'Dr'];
