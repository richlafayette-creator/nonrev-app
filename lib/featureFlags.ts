export function isConversationalWorkspaceEnabled() {
  return process.env.NEXT_PUBLIC_CONVERSATIONAL_WORKSPACE !== 'false'
}
