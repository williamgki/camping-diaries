// External links. Swap SUGGESTION_FORM_URL for the real Google Form once it
// exists (Settings → "Send" → link). If left empty, the Feedback panel falls
// back to a pre-filled email to the maintainer.
export const SUGGESTION_FORM_URL = ''

export const MAINTAINER_EMAIL = 'williamgkirby@gmail.com'

export function suggestionMailto(): string {
  const subject = encodeURIComponent('Camping Diaries — a suggestion')
  const body = encodeURIComponent(
    [
      'Your name:',
      'Which trip or place:',
      'Type (correction / name or place / photo / other):',
      '',
      'Your suggestion:',
      '',
    ].join('\n'),
  )
  return `mailto:${MAINTAINER_EMAIL}?subject=${subject}&body=${body}`
}
