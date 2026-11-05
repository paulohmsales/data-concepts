/**
 * A small fictional company handbook (Acme Analytics) used by the RAG and embeddings modules.
 * Each question has the exact answer text, so retrieval can be scored without an LLM.
 */
export interface Doc {
  id: string
  title: string
  text: string
}

export const DOCS: Doc[] = [
  {
    id: 'oncall',
    title: 'On-call',
    text: 'Every data engineer joins the on-call rotation after their third month. A rotation lasts one week, from Monday 10:00 to the following Monday 10:00. The primary responder must acknowledge a page within 15 minutes during business hours and within 30 minutes at night. If the primary does not acknowledge, the page escalates to the secondary and then to the engineering manager. On-call engineers receive a stipend of 300 euros per week and one day off after a week with more than three night pages. Incidents are reviewed in the Thursday operations meeting, and every severity-one incident needs a written postmortem within five working days.',
  },
  {
    id: 'leave',
    title: 'Time off',
    text: 'Employees accrue 25 days of paid time off per year, credited monthly. Up to five unused days can be carried over into the next year; anything above that expires on 31 March. Requests for more than five consecutive days should be submitted at least four weeks in advance through the HR portal. Public holidays follow the calendar of the country in which you are employed. Parental leave is 20 weeks at full pay for every parent, and it can be split into up to three blocks within the first two years.',
  },
  {
    id: 'expenses',
    title: 'Expenses',
    text: 'Work expenses are reimbursed within 30 days of approval. Submit receipts in the finance app within 60 days of the purchase. Each employee has a learning budget of 1,500 euros per year for courses, books and conferences; unused budget does not roll over. Home office equipment is covered up to 800 euros once every three years. Travel must be booked through the travel desk, and economy class is the default for flights shorter than six hours.',
  },
  {
    id: 'retention',
    title: 'Data retention',
    text: 'Raw event data is kept in the lake for 13 months and then deleted automatically. Aggregated tables in the warehouse are kept for seven years to satisfy financial audit requirements. Personal data must be deleted within 30 days of a verified deletion request; the privacy team tracks every request in the compliance tracker. Backups of the production database are retained for 35 days. Data containing payment card numbers is never stored in the warehouse; it stays inside the payment provider.',
  },
  {
    id: 'sla',
    title: 'Dashboard freshness',
    text: 'Tier-one dashboards, such as revenue and orders, must be refreshed by 07:00 Lisbon time every day. Their freshness target is met on at least 99 percent of days per quarter, which allows roughly one late day per quarter. Tier-two dashboards are refreshed by noon and have a 95 percent target. When a tier-one dashboard is late, the on-call engineer posts an update in the data-incidents channel every hour until it recovers. Freshness is measured by the timestamp of the latest loaded partition, not by when the job finished.',
  },
  {
    id: 'deploy',
    title: 'Deployments',
    text: 'All pipeline changes go through a pull request reviewed by at least one other engineer. Continuous integration runs the dbt tests and a slim build of the modified models against a staging copy of the warehouse. Deployments to production happen automatically after merge, except on Fridays after 15:00 and during the last two days of each quarter, when deployments are frozen. Rollbacks are done by reverting the merge commit; never hotfix production tables by hand.',
  },
  {
    id: 'access',
    title: 'Access and security',
    text: 'Access to the warehouse is granted through groups, never to individual users. Analysts get read access to the marts schema by default; access to raw schemas requires approval from the data platform lead. Columns tagged as personal data are masked for everyone outside the privacy-cleared group. Service accounts must use key-pair authentication, and keys are rotated every 90 days. Multi-factor authentication is mandatory for every human account.',
  },
  {
    id: 'onboarding',
    title: 'Onboarding',
    text: 'New joiners receive their laptop on the first day and complete the security training within the first week. During the first month each new engineer pairs with a buddy from another team and ships a small change to production. The onboarding checklist lives in the wiki. By the end of the second month, new engineers present one dataset they own in the analytics guild. Questions about payroll go to the people team, not to the manager.',
  },
]

export interface Question {
  q: string
  /** Exact answer text as it appears in a document. */
  answer: string
  doc: string
  /** True when the question uses different words from the document (keyword search struggles). */
  paraphrase?: boolean
}

export const QUESTIONS: Question[] = [
  { q: 'How quickly must the primary on-call acknowledge a page at night?', answer: 'within 30 minutes at night', doc: 'oncall' },
  { q: 'How much is the on-call stipend?', answer: 'a stipend of 300 euros per week', doc: 'oncall' },
  { q: 'How many unused vacation days can I carry over?', answer: 'Up to five unused days can be carried over into the next year', doc: 'leave', paraphrase: true },
  { q: 'How long is parental leave?', answer: 'Parental leave is 20 weeks at full pay', doc: 'leave' },
  { q: 'What is my yearly budget for training and conferences?', answer: 'a learning budget of 1,500 euros per year', doc: 'expenses', paraphrase: true },
  { q: 'How long do we keep raw event data?', answer: 'Raw event data is kept in the lake for 13 months', doc: 'retention' },
  { q: 'How fast must we delete personal data after someone asks?', answer: 'deleted within 30 days of a verified deletion request', doc: 'retention', paraphrase: true },
  { q: 'By what time must the revenue dashboard be updated?', answer: 'refreshed by 07:00 Lisbon time every day', doc: 'sla', paraphrase: true },
  { q: 'When are deployments frozen?', answer: 'except on Fridays after 15:00 and during the last two days of each quarter', doc: 'deploy' },
  { q: 'How often are service account keys rotated?', answer: 'keys are rotated every 90 days', doc: 'access' },
  { q: 'What does a new engineer present after two months?', answer: 'present one dataset they own in the analytics guild', doc: 'onboarding' },
  { q: 'How long are production database backups kept?', answer: 'Backups of the production database are retained for 35 days', doc: 'retention' },
  { q: 'Who should I contact if my salary is wrong?', answer: 'Questions about payroll go to the people team', doc: 'onboarding', paraphrase: true },
]
