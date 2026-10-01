import { createClient } from 'genlayer-js';
import { testnetBradbury, testnetAsimov, studionet } from 'genlayer-js/chains';
import { ExecutionResult, TransactionStatus } from 'genlayer-js/types';
import './style.css';

const networkTable = {
  bradbury: { label: 'Bradbury testnet', chain: testnetBradbury, sdkName: 'testnetBradbury', explorer: 'https://explorer-bradbury.genlayer.com' },
  asimov: { label: 'Asimov testnet', chain: testnetAsimov, sdkName: 'testnetAsimov', explorer: 'https://explorer-asimov.genlayer.com' },
  studionet: { label: 'Studionet', chain: studionet, sdkName: 'studionet', explorer: 'https://explorer-studio.genlayer.com' },
};
const READ_ONLY_CALLER = '0x0000000000000000000000000000000000000000';

const el = (selector) => document.querySelector(selector);
const networkSelect = el('#network');
const connectButton = el('#connect-wallet');
const walletStatus = el('#wallet-status');
const contractInput = el('#contract-address');
const submitButton = el('#submit-review');
const activity = el('#activity');
const resultEmpty = el('#result-empty');
const resultContent = el('#result-content');
const loadLatestButton = el('#load-latest');
const claimInput = el('#claim');
const source3Wrap = el('#source-3-wrap');
const assessmentLookupForm = el('#assessment-lookup-form');
const assessmentLookupIdInput = el('#assessment-lookup-id');
const lookupAssessmentButton = el('#lookup-assessment');
const copyAssessmentLinkButton = el('#copy-assessment-link');
const resultTitle = el('#result-title');
const resultDescription = el('#result-empty p');

const MAX_ASSESSMENT_ID = (1n << 256n) - 1n;
let activeAccount = '';
let activeClient;
let activeNetworkKey = networkSelect.value;
let lookupSequence = 0;
let requestedAssessmentId = null;
let displayedAssessmentId = null;
let permalinkIssue = '';

const persistedAddress = localStorage.getItem('claimlens.contractAddress');
const persistedNetwork = localStorage.getItem('claimlens.network');
if (persistedNetwork && networkTable[persistedNetwork]) {
  activeNetworkKey = persistedNetwork;
  networkSelect.value = persistedNetwork;
}
if (persistedAddress) contractInput.value = persistedAddress;

const urlParameters = new URLSearchParams(window.location.search);
const permalinkNetwork = urlParameters.get('network');
if (permalinkNetwork !== null) {
  if (Object.prototype.hasOwnProperty.call(networkTable, permalinkNetwork)) {
    activeNetworkKey = permalinkNetwork;
    networkSelect.value = permalinkNetwork;
  } else {
    permalinkIssue = 'This shared link names an unsupported GenLayer network.';
  }
}
const permalinkContract = urlParameters.get('contract');
if (urlParameters.has('contract')) {
  if (/^0x[a-fA-F0-9]{40}$/.test((permalinkContract || '').trim())) {
    contractInput.value = permalinkContract.trim();
  } else {
    permalinkIssue = permalinkIssue || 'This shared link contains an invalid contract address.';
  }
}
if (urlParameters.has('assessment')) {
  const permalinkAssessment = urlParameters.get('assessment') || '';
  assessmentLookupIdInput.value = permalinkAssessment;
  try {
    requestedAssessmentId = parseAssessmentId(permalinkAssessment);
  } catch (error) {
    permalinkIssue = permalinkIssue || error.message;
  }
}

function setActivity(message, isError = false) {
  activity.replaceChildren();
  activity.classList.toggle('error', isError);
  activity.textContent = message;
}

function parseAssessmentId(value) {
  const normalized = String(value ?? '').trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error('Enter a nonnegative whole-number assessment ID.');
  }
  const significantDigits = normalized.replace(/^0+(?=\d)/, '');
  if (significantDigits.length > 78) {
    throw new Error('Assessment ID must fit the contract uint256 range.');
  }
  const id = BigInt(significantDigits);
  if (id > MAX_ASSESSMENT_ID) {
    throw new Error('Assessment ID must fit the contract uint256 range.');
  }
  return id;
}

function showResultMessage(title, message) {
  resultContent.hidden = true;
  resultEmpty.hidden = false;
  resultTitle.textContent = title;
  resultDescription.textContent = message;
  displayedAssessmentId = null;
  copyAssessmentLinkButton.hidden = true;
}

function updateAssessmentPermalink(id) {
  const url = new URL(window.location.href);
  url.searchParams.set('network', activeNetworkKey);
  url.searchParams.set('contract', getContractAddress());
  url.searchParams.set('assessment', id.toString());
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}

function getContractAddress() {
  const address = contractInput.value.trim();
  return /^0x[a-fA-F0-9]{40}$/.test(address) ? address : '';
}

function getSources() {
  return ['#source-1', '#source-2', '#source-3']
    .map((selector) => el(selector).value.trim())
    .filter(Boolean);
}

function updateFormState() {
  const validClaim = claimInput.value.trim().length > 0 && claimInput.value.trim().length <= 280;
  const sources = getSources();
  const validSources = sources.length >= 2 && sources.length <= 3
    && sources.every((url) => {
      try { return new URL(url).protocol === 'https:'; } catch { return false; }
    })
    && new Set(sources).size === sources.length;
  const canReview = Boolean(activeAccount && getContractAddress() && validClaim && validSources);
  submitButton.disabled = !canReview;
  el('#claim-count').textContent = `${claimInput.value.length} / 280`;
}

function getReadClient() {
  return createClient({
    chain: networkTable[activeNetworkKey].chain,
    account: activeAccount || READ_ONLY_CALLER,
  });
}

async function connectWallet() {
  const provider = window.okxwallet || window.ethereum;
  if (!provider?.request) {
    setActivity('No compatible browser wallet was found. Install or enable a wallet that supports EIP-1193, then reload this page.', true);
    return;
  }
  connectButton.disabled = true;
  setActivity(`Requesting wallet access for ${networkTable[activeNetworkKey].label}…`);
  try {
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (!Array.isArray(accounts) || !accounts[0]) throw new Error('The wallet did not return an account.');
    const network = networkTable[activeNetworkKey];
    activeAccount = accounts[0];
    activeClient = createClient({ chain: network.chain, account: activeAccount, provider });
    await activeClient.connect(network.sdkName);
    walletStatus.textContent = `${activeAccount.slice(0, 6)}…${activeAccount.slice(-4)} · ${network.label}`;
    connectButton.innerHTML = 'Wallet connected <span aria-hidden="true">✓</span>';
    setActivity('Wallet connected. Add a deployed ClaimLens contract address to read or submit reviews.');
  } catch (error) {
    activeAccount = '';
    activeClient = undefined;
    walletStatus.textContent = 'Wallet not connected';
    setActivity(error instanceof Error ? error.message : 'Could not connect the wallet.', true);
  } finally {
    connectButton.disabled = false;
    updateFormState();
    await refreshContractSummary();
  }
}

async function refreshContractSummary() {
  const request = ++lookupSequence;
  const address = getContractAddress();
  loadLatestButton.disabled = true;

  if (permalinkIssue) {
    el('#assessment-count').textContent = '—';
    showResultMessage('Shared link could not be opened', permalinkIssue);
    setActivity(permalinkIssue, true);
    return;
  }
  if (!address) {
    el('#assessment-count').textContent = '—';
    showResultMessage('Enter a contract address', 'Paste a valid deployed ClaimLens contract address to read its assessments.');
    setActivity('A valid contract address is required for read-only lookup.', true);
    return;
  }

  try {
    const count = BigInt(String(await getReadClient().readContract({
      address,
      functionName: 'get_assessment_count',
      args: [],
    })));
    if (request !== lookupSequence) return;

    el('#assessment-count').textContent = count.toString();
    loadLatestButton.disabled = count === 0n;
    if (requestedAssessmentId !== null) {
      await loadAssessment(requestedAssessmentId);
    } else if (count > 0n) {
      await loadAssessment(count - 1n);
    } else {
      showResultMessage('No assessments yet', 'This contract has not finalized an assessment. You can look up an ID after one is recorded.');
      setActivity('Connected to ClaimLens. No assessments have been stored yet.');
    }
  } catch (error) {
    if (request !== lookupSequence) return;
    el('#assessment-count').textContent = '—';
    loadLatestButton.disabled = true;
    showResultMessage('Could not read this contract', 'Check the selected network and deployed ClaimLens contract address, then try again.');
    setActivity(error instanceof Error ? error.message : 'Could not read this contract.', true);
  }
}

async function loadAssessment(id) {
  const request = ++lookupSequence;
  requestedAssessmentId = id;
  assessmentLookupIdInput.value = id.toString();
  lookupAssessmentButton.disabled = true;
  showResultMessage('Loading assessment ' + id.toString(), 'Reading the stored result from the selected GenLayer network…');
  setActivity('Reading finalized assessment ' + id.toString() + ' from ' + networkTable[activeNetworkKey].label + '…');

  const address = getContractAddress();
  if (!address) {
    showResultMessage('Enter a contract address', 'Paste a valid deployed ClaimLens contract address to read its assessments.');
    setActivity('A valid contract address is required for read-only lookup.', true);
    lookupAssessmentButton.disabled = false;
    return;
  }

  try {
    const readClient = getReadClient();
    const count = BigInt(String(await readClient.readContract({
      address,
      functionName: 'get_assessment_count',
      args: [],
    })));
    if (request !== lookupSequence) return;
    el('#assessment-count').textContent = count.toString();
    loadLatestButton.disabled = count === 0n;

    if (id >= count) {
      showResultMessage('Assessment not found', 'No finalized assessment with ID ' + id.toString() + ' exists in this contract yet.');
      setActivity('Assessment ID ' + id.toString() + ' has not been finalized in this contract.', true);
      return;
    }

    const raw = await readClient.readContract({
      address,
      functionName: 'get_assessment',
      args: [id],
    });
    if (request !== lookupSequence) return;

    let record;
    if (typeof raw === 'string') {
      if (!raw.trim()) {
        showResultMessage('Assessment not found', 'The contract has no stored result for ID ' + id.toString() + '.');
        setActivity('No finalized assessment was returned for ID ' + id.toString() + '.', true);
        return;
      }
      try {
        record = JSON.parse(raw);
      } catch {
        throw new Error('The contract returned a malformed assessment record.');
      }
    } else {
      record = raw;
    }

    const allowedVerdicts = ['SUPPORTED', 'REFUTED', 'MIXED', 'INSUFFICIENT'];
    if (!record || typeof record !== 'object' || Array.isArray(record)
      || !allowedVerdicts.includes(String(record.verdict || '').toUpperCase())) {
      throw new Error('The contract returned an unrecognized assessment record.');
    }

    showAssessment(record, id);
    displayedAssessmentId = id;
    updateAssessmentPermalink(id);
    copyAssessmentLinkButton.hidden = false;
    setActivity('Assessment ' + id.toString() + ' loaded. This was a read-only lookup; no transaction was submitted.');
  } catch (error) {
    if (request !== lookupSequence) return;
    showResultMessage('Assessment could not be loaded', 'Check the selected network and contract, then retry the lookup.');
    setActivity(error instanceof Error ? error.message : 'Could not load the assessment.', true);
  } finally {
    if (request === lookupSequence) lookupAssessmentButton.disabled = false;
  }
}

function showAssessment(record, id) {
  resultEmpty.hidden = true;
  resultContent.hidden = false;
  const verdict = String(record.verdict || 'INSUFFICIENT').toUpperCase();
  const verdictNode = el('#verdict');
  verdictNode.textContent = verdict;
  verdictNode.className = 'verdict-pill ' + verdict.toLowerCase();
  el('#assessment-id').textContent = 'ASSESSMENT ' + id.toString();
  assessmentLookupIdInput.value = id.toString();
  el('#result-claim').textContent = record.claim || 'Claim text unavailable.';
  el('#rationale').textContent = record.rationale || 'No rationale was stored.';
  el('#sources-used').textContent = (record.sources_used ?? record.sources?.length ?? 0) + ' sources reviewed';
  const sources = el('#result-sources');
  sources.replaceChildren();
  for (const url of (Array.isArray(record.sources) ? record.sources : [])) {
    let safeUrl;
    try {
      safeUrl = new URL(String(url));
    } catch {
      continue;
    }
    if (safeUrl.protocol !== 'https:') continue;
    const link = document.createElement('a');
    link.className = 'result-source';
    link.href = safeUrl.href;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = url;
    sources.append(link);
  }
}

async function copyAssessmentPermalink() {
  if (displayedAssessmentId === null) return;
  const shareUrl = window.location.href;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(shareUrl);
    } else {
      const temporaryInput = document.createElement('textarea');
      temporaryInput.value = shareUrl;
      temporaryInput.setAttribute('readonly', '');
      temporaryInput.style.position = 'fixed';
      temporaryInput.style.opacity = '0';
      document.body.append(temporaryInput);
      temporaryInput.select();
      const copied = document.execCommand('copy');
      temporaryInput.remove();
      if (!copied) throw new Error('Clipboard access is unavailable.');
    }
    setActivity('Share link copied. Anyone with the link can read this public assessment.');
  } catch {
    setActivity('Clipboard access was blocked. The shareable assessment link is in the browser address bar.', true);
  }
}
async function submitReview(event) {
  event.preventDefault();
  const address = getContractAddress();
  if (!activeClient || !address) return;
  const write = {
    address,
    functionName: 'assess',
    args: [claimInput.value.trim(), getSources().join('\n')],
    value: 0n,
  };
  const confirmed = window.confirm('This submits a state-changing GenLayer transaction. Your wallet will show the network fee before you approve it. Continue to the wallet request?');
  if (!confirmed) return;
  submitButton.disabled = true;
  setActivity('Submitting to the wallet… approve only if the displayed network and fee are expected.');
  let transactionHash;
  try {
    transactionHash = await activeClient.writeContract(write);
    const link = document.createElement('a');
    link.href = `${networkTable[activeNetworkKey].explorer}/tx/${transactionHash}`;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = `Track transaction ${transactionHash.slice(0, 10)}…`;
    activity.replaceChildren(document.createTextNode('Transaction submitted. Waiting for finalization. '), link);
    const transaction = await activeClient.waitForTransactionReceipt({
      hash: transactionHash,
      status: TransactionStatus.FINALIZED,
    });
    if (transaction.txExecutionResultName !== ExecutionResult.FINISHED_WITH_RETURN) {
      throw new Error(`Transaction finalized without a successful contract result (${transaction.statusName} / ${transaction.txExecutionResultName}). Inspect the receipt before retrying.`);
    }
    setActivity(`Review recorded. ${transactionHash}`);
    requestedAssessmentId = null;
    await refreshContractSummary();
  } catch (error) {
    const prefix = transactionHash ? 'A transaction hash exists; do not submit the same review again until its receipt is checked. ' : 'No transaction hash was returned. ';
    setActivity(`${prefix}${error instanceof Error ? error.message : 'The wallet or network request failed.'}`, true);
    if (transactionHash) {
      const link = document.createElement('a');
      link.href = `${networkTable[activeNetworkKey].explorer}/tx/${transactionHash}`;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = 'Inspect transaction receipt';
      activity.append(document.createTextNode(' '), link);
    }
  } finally {
    submitButton.disabled = false;
    updateFormState();
  }
}

connectButton.addEventListener('click', connectWallet);
claimInput.addEventListener('input', updateFormState);
assessmentLookupIdInput.addEventListener('input', () => {
  assessmentLookupIdInput.removeAttribute('aria-invalid');
  if (permalinkIssue) permalinkIssue = '';
});
assessmentLookupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  permalinkIssue = '';
  try {
    const id = parseAssessmentId(assessmentLookupIdInput.value);
    assessmentLookupIdInput.removeAttribute('aria-invalid');
    await loadAssessment(id);
  } catch (error) {
    assessmentLookupIdInput.setAttribute('aria-invalid', 'true');
    const message = error instanceof Error ? error.message : 'Enter a valid assessment ID.';
    showResultMessage('Assessment ID needs attention', message);
    setActivity(message, true);
  }
});
copyAssessmentLinkButton.addEventListener('click', copyAssessmentPermalink);
contractInput.addEventListener('input', () => {
  permalinkIssue = '';
  const address = getContractAddress();
  if (address) localStorage.setItem('claimlens.contractAddress', address);
  else localStorage.removeItem('claimlens.contractAddress');
  updateFormState();
  refreshContractSummary();
});
for (const selector of ['#source-1', '#source-2', '#source-3']) {
  el(selector).addEventListener('input', updateFormState);
}
networkSelect.addEventListener('change', async () => {
  permalinkIssue = '';
  activeNetworkKey = networkSelect.value;
  localStorage.setItem('claimlens.network', activeNetworkKey);
  if (activeAccount) await connectWallet();
  else {
    walletStatus.textContent = `Wallet not connected · ${networkTable[activeNetworkKey].label}`;
    await refreshContractSummary();
  }
  updateFormState();
});
el('#add-source').addEventListener('click', () => {
  source3Wrap.hidden = false;
  el('#add-source').hidden = true;
  el('#source-3').focus();
});
el('#remove-source').addEventListener('click', () => {
  el('#source-3').value = '';
  source3Wrap.hidden = true;
  el('#add-source').hidden = false;
  updateFormState();
});
el('#review-form').addEventListener('submit', submitReview);
loadLatestButton.addEventListener('click', async () => {
  permalinkIssue = '';
  requestedAssessmentId = null;
  assessmentLookupIdInput.value = '';
  const url = new URL(window.location.href);
  url.searchParams.delete('assessment');
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  await refreshContractSummary();
});

if (activeAccount) walletStatus.textContent = `${activeAccount.slice(0, 6)}…${activeAccount.slice(-4)}`;
else walletStatus.textContent = `Wallet not connected · ${networkTable[activeNetworkKey].label}`;
updateFormState();
refreshContractSummary();
