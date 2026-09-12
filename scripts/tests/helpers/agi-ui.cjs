const categories = {
  train: 'research', posttrain: 'research', optimize: 'research', compute: 'research', self: 'research', safety: 'research', distill: 'research',
  release: 'business', market: 'business', fund: 'business', special: 'business',
  video: 'ecosystem', openvideo: 'ecosystem', learn: 'ecosystem',
};
const readAi = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function resolveAiEvent(page) {
  if (!(await readAi(page)).industry.eventResolved) await page.locator('[data-event-choice]:not(:disabled)').first().click();
}
async function aiTab(page, tab) {
  await resolveAiEvent(page);
  await page.locator(`[data-decision-tab="${tab}"]`).click();
}
async function aiAction(page, id) {
  await resolveAiEvent(page);
  if (categories[id]) await aiTab(page, categories[id]);
  if (id === 'distill' && !await page.locator('#agi-distill-target').isVisible()) await page.getByText('向同行蒸馏模型', { exact: false }).click();
  await page.locator(`[data-action="${id}"]`).click();
}
async function aiPolicy(page, name) {
  await resolveAiEvent(page);
  if (!await page.getByRole('button', { name, exact: true }).isVisible()) await page.locator('summary').filter({ hasText: '本季方针' }).click();
  await page.getByRole('button', { name, exact: true }).click();
}
async function chooseAiCompany(page, company) {
  if (!await page.locator(`[data-company="${company}"]`).isVisible()) await page.getByText('更多厂商（7）', { exact: true }).click();
  await page.locator(`[data-company="${company}"]`).click();
}
module.exports = { aiAction, aiPolicy, aiTab, chooseAiCompany, resolveAiEvent };
