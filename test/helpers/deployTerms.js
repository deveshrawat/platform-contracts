import { expect } from "chai";
import { leftPad, isHex } from "web3-utils";
import {
  daysToSeconds,
  Q18,
  Q16,
  web3,
  defaultTokensPerShare,
  defEquityTokenDecimals,
  dayInSeconds,
  ZERO_BN,
} from "./constants";
import { findConstructor, camelCase, getKeyByValue } from "./utils";
import {
  GovAction,
  GovTokenVotingRule,
  GovActionEscalation,
  GovActionLegalRep,
  hasVotingRights,
  isVotingEscalation,
} from "./govState";
import { knownInterfaces } from "../helpers/knownInterfaces";

const bn = n => new web3.BigNumber(n);

export const defaultTokenholderTerms = {
  GENERAL_VOTING_RULE: bn(GovTokenVotingRule.Positive),
  TAG_ALONG_VOTING_RULE: bn(GovTokenVotingRule.Negative),
  LIQUIDATION_PREFERENCE_MULTIPLIER_FRAC: Q18.mul(1.5),
  HAS_FOUNDERS_VESTING: true,
  GENERAL_VOTING_DURATION: bn(daysToSeconds(10)),
  RESTRICTED_ACT_VOTING_DURATION: bn(daysToSeconds(14)),
  SHAREHOLDERS_VOTING_QUORUM_FRAC: Q18.mul("0.1"),
  VOTING_MAJORITY_FRAC: Q18.mul("0.5"),
};

// consider moving those to Token Holder Rights
export const defaultTHRTerms = {
  GENERAL_THR_VOTING_RULE: bn(GovTokenVotingRule.Prorata),
};

export const defDurTerms = {
  WHITELIST_DURATION: bn(daysToSeconds(7)),
  PUBLIC_DURATION: bn(daysToSeconds(30)),
  SIGNING_DURATION: bn(daysToSeconds(14)),
  CLAIM_DURATION: bn(daysToSeconds(10)),
};

export const defTokenTerms = {
  EQUITY_TOKEN_NAME: "Quintessence",
  EQUITY_TOKEN_SYMBOL: "FFT",
  ISIN: "DE037652",
  MIN_NUMBER_OF_TOKENS: defaultTokensPerShare.mul(20),
  MAX_NUMBER_OF_TOKENS: defaultTokensPerShare.mul(100),
  TOKEN_PRICE_EUR_ULPS: Q18.mul("0.12376189651788"),
  MAX_NUMBER_OF_TOKENS_IN_WHITELIST: defaultTokensPerShare.mul(40),
  SHARE_NOMINAL_VALUE_EUR_ULPS: Q18.mul("4.24566"),
  SHARE_NOMINAL_VALUE_ULPS: Q18,
  EQUITY_TOKENS_PER_SHARE: defaultTokensPerShare,
  EQUITY_TOKEN_DECIMALS: defEquityTokenDecimals,
};

export const defEtoTerms = {
  DURATION_TERMS: null,
  TOKEN_TERMS: null,
  SHARE_CAPITAL_CURRENCY_CODE: "PLN",
  EXISTING_SHARE_CAPITAL: Q18.mul(32000),
  AUTHORIZED_CAPITAL: Q18.mul(1254),
  MIN_TICKET_EUR_ULPS: Q18.mul(500),
  MAX_TICKET_EUR_ULPS: Q18.mul(1000000),
  ENABLE_TRANSFERS_ON_SUCCESS: false,
  INVESTOR_OFFERING_DOCUMENT_URL: "893289290300923809jdkljoi3",
  INVESTMENT_AGREEMENT_TEMPLATE_URL: "9032ujidjosa9012809919293",
  TOKENHOLDER_RIGHTS: null,
  WHITELIST_DISCOUNT_FRAC: Q18.mul("0.3"),
  PUBLIC_DISCOUNT_FRAC: Q18.mul(0),
};

export const defTermsConstraints = {
  CAN_SET_TRANSFERABILITY: true,
  HAS_NOMINEE: true,
  MIN_TICKET_SIZE_EUR_ULPS: Q18.mul(0),
  // unlimited
  MAX_TICKET_SIZE_EUR_ULPS: Q18.mul(0),
  MIN_INVESTMENT_AMOUNT_EUR_ULPS: Q18.mul(0),
  // unlimited
  MAX_INVESTMENT_AMOUNT_EUR_ULPS: Q18.mul(0),
  NAME: "Some Constraints",
  OFFERING_DOCUMENT_TYPE: bn(1),
  OFFERING_DOCUMENT_SUB_TYPE: bn(1),
  JURISDICTION: "DE",
  ASSET_TYPE: bn(0),
  TOKEN_OFFERING_OPERATOR: "0xC5a96Db085dDA36FfBE390f455315D30D6D3DC52",
};

export function validateTerms(artifact, terms) {
  const constructor = findConstructor(artifact);
  const camelTerms = {};
  // could not find any good way to do dictionary comprehension
  Object.keys(terms).map(k => {
    camelTerms[camelCase(k)] = terms[k];
    return k;
  });
  if (Object.keys(terms).length !== constructor.inputs.length) {
    throw new Error(
      `No. params in terms not equal no. inputs in constructor of ${artifact.contract_name}`,
    );
  }
  const termsValues = [];
  let idx = 0;
  for (const input of constructor.inputs) {
    if (!(input.name in camelTerms)) {
      throw new Error(
        // eslint-disable-next-line max-len
        `Input at ${idx} name in constructor "${input.name}" could not be found in terms of ${artifact.contract_name}`,
      );
    }
    let typeMatch = false;
    const termValue = camelTerms[input.name];
    switch (input.type) {
      case "address":
      case "string":
        typeMatch = typeof termValue === "string";
        break;
      case "uint8":
      case "uint32":
      case "uint256":
      case "uint128":
        if (typeof termValue === "object") {
          typeMatch = termValue.constructor.name.includes("BigNumber");
        }
        break;
      case "bool":
        typeMatch = typeof termValue === "boolean";
        break;
      case "uint56[24]":
      case "uint56[25]":
      case "uint56[26]":
      case "uint56[27]":
        if (typeof termValue === "object") {
          typeMatch = termValue.constructor.name.includes("Array");
        }
        break;
      default:
        throw new Error(
          `Unsupported abi type ${input.type} name ${input.name} of ${artifact.contract_name}`,
        );
    }
    if (!typeMatch) {
      throw new Error(
        // eslint-disable-next-line max-len
        `Type mismatch type ${input.type} name ${input.name} value ${termValue} of ${artifact.contract_name}`,
      );
    }
    termsValues.push(termValue);
    idx += 1;
  }
  return [Object.keys(terms), termsValues];
}

export async function verifyTerms(c, keys, dict) {
  for (const f of keys) {
    const rv = await c[f]();
    if (rv instanceof Object) {
      if (rv.constructor.name.includes("Array")) {
        expect(rv.length, f).to.eq(dict[f].length);
        // assume arrays contain only big numbers
        for (let ii = 0; ii < rv.length; ii += 1) {
          expect(rv[ii], f).to.be.bignumber.eq(dict[f][ii]);
        }
        // expect(rv, f).to.deep.eq(dict[f]);
      } else {
        expect(rv, f).to.be.bignumber.eq(dict[f]);
      }
    } else {
      expect(rv, f).to.eq(dict[f]);
    }
  }
}

export function encodeBylaw(
  actionEscalation,
  votingDuration,
  quorum,
  majority,
  absoluteMajority,
  votingRule,
  votingLegalRep,
  votingInitiator,
  tokenholderVotingInitative,
) {
  const f = n => {
    const r = leftPad(n.toString(16), 2);
    if (r.length > 2) {
      throw new Error(`left pad value ${r} for ${n} invalid`);
    }
    return r;
  };
  const prc = big => {
    const r = big.mul("100").div(Q18);
    if (r.gt("100") || !r.round().eq(r)) {
      throw new Error(`prc value ${r.toString()} of ${big.toString()} invalid`);
    }
    return r;
  };
  const days = big => {
    const r = big.div(dayInSeconds);
    if (r.gt(255)) {
      throw new Error(`days value ${r.toString()} of ${big.toString()} invalid`);
    }
    return r;
  };

  if (isVotingEscalation(votingRule)) {
    if (votingDuration.eq(0)) {
      throw new Error(`voting duration must be set for voting bylaw`);
    }
    // voting power OR quorum / majority must be set
    const hasQuorum = quorum.gt(0) && majority.gt(0);
    const hasAbsoluteMajority = absoluteMajority.gt(0);
    if (!hasQuorum && !hasAbsoluteMajority) {
      throw new Error(`quorum/majority or absolute majority must be set for voting bylaw`);
    }
  }

  // encodes voting info into single uint8 (initative 1b|initiator 3b|voting legal rep 3b)
  const encodeVotingInfo = (rep, initiator, initative) =>
    rep + initiator * 8 + (initative ? 64 : 0);

  const votingInfo = encodeVotingInfo(votingLegalRep, votingInitiator, tokenholderVotingInitative);
  return `0x${f(actionEscalation)}${f(days(votingDuration))}${f(prc(quorum))}${f(prc(majority))}${f(
    prc(absoluteMajority),
  )}${f(votingRule)}${f(votingInfo)}`;
}

export function decodeBylaw(idx, bylaw) {
  if (!isHex(bylaw)) {
    throw new Error(`bylaw ${bylaw} must be a hex number`);
  }
  // skip hex prefix
  const npBylaw = bylaw.substring(2);
  if (npBylaw.length !== 14) {
    throw new Error(`bylaw ${bylaw} must contain 7 8 bit elements`);
  }
  const elems = npBylaw.match(/.{2}/g);
  // convert idx in the bylaws to action string
  const action = getKeyByValue(GovAction, idx);
  const frac = hex => new web3.BigNumber(hex, 16).mul(Q16);
  const num = hex => new web3.BigNumber(hex, 16);

  const votingInfo = num(elems[6]).toNumber();

  return [
    // action as string
    action,
    // escalation level
    num(elems[0]),
    // voting duration seconds
    bn(daysToSeconds(parseInt(elems[1], 16))),
    // quorum
    frac(elems[2]),
    // majority
    frac(elems[3]),
    // voting power
    frac(elems[4]),
    // token holder voting rule
    num(elems[5]),
    // legal rep for voting
    bn(votingInfo & 0x7),
    // voting initiator
    bn((votingInfo & 0x38) >>> 3),
    // voting initative
    bn((votingInfo & 0x40) >>> 6),
  ];
}

export function generateDefaultBylaws(terms) {
  const bylaws = [];
  for (const action of Object.keys(GovAction)) {
    switch (action) {
      case "RestrictedNone":
      case "ChangeOfControl":
      case "DissolveCompany":
        bylaws.push(
          encodeBylaw(
            GovActionEscalation.SHR,
            terms.RESTRICTED_ACT_VOTING_DURATION,
            terms.SHAREHOLDERS_VOTING_QUORUM_FRAC,
            terms.VOTING_MAJORITY_FRAC,
            ZERO_BN,
            terms.GENERAL_VOTING_RULE,
            GovActionLegalRep.CompanyLegalRep,
            GovActionLegalRep.CompanyLegalRep,
            false,
          ),
        );
        break;
      case "TagAlong":
        bylaws.push(
          encodeBylaw(
            GovActionEscalation.THR,
            terms.GENERAL_VOTING_DURATION,
            terms.SHAREHOLDERS_VOTING_QUORUM_FRAC,
            terms.VOTING_MAJORITY_FRAC,
            ZERO_BN,
            terms.TAG_ALONG_VOTING_RULE,
            GovActionLegalRep.None,
            GovActionLegalRep.Nominee,
            false,
          ),
        );
        break;
      case "THRNone":
        bylaws.push(
          encodeBylaw(
            GovActionEscalation.THR,
            terms.GENERAL_VOTING_DURATION,
            terms.SHAREHOLDERS_VOTING_QUORUM_FRAC,
            terms.VOTING_MAJORITY_FRAC,
            ZERO_BN,
            GovTokenVotingRule.Prorata,
            GovActionLegalRep.None,
            GovActionLegalRep.Nominee,
            true,
          ),
        );
        break;
      case "ChangeNominee":
        bylaws.push(
          encodeBylaw(
            GovActionEscalation.Nominee,
            ZERO_BN,
            ZERO_BN,
            ZERO_BN,
            ZERO_BN,
            bn(GovTokenVotingRule.NoVotingRights),
            GovActionLegalRep.None,
            GovActionLegalRep.None,
            false,
          ),
        );
        break;
      case "AntiDilutionProtection":
        bylaws.push(
          encodeBylaw(
            GovActionEscalation.TokenHolder,
            ZERO_BN,
            ZERO_BN,
            ZERO_BN,
            ZERO_BN,
            bn(GovTokenVotingRule.NoVotingRights),
            GovActionLegalRep.None,
            GovActionLegalRep.None,
            false,
          ),
        );
        break;
      case "CloseToken":
        bylaws.push(
          encodeBylaw(
            GovActionEscalation.ParentResolution,
            ZERO_BN,
            ZERO_BN,
            ZERO_BN,
            ZERO_BN,
            bn(GovTokenVotingRule.NoVotingRights),
            GovActionLegalRep.None,
            GovActionLegalRep.None,
            false,
          ),
        );
        break;
      case "ChangeTokenController":
      case "CancelResolution":
        // empty setting
        bylaws.push(
          encodeBylaw(
            GovActionEscalation.Anyone,
            ZERO_BN,
            ZERO_BN,
            ZERO_BN,
            ZERO_BN,
            bn(GovTokenVotingRule.NoVotingRights),
            GovActionLegalRep.None,
            GovActionLegalRep.None,
            false,
          ),
        );
        break;
      case "CompanyNone":
      case "StopToken":
      case "ContinueToken":
      case "OrdinaryPayout":
      case "EstablishESOP":
      case "ConvertESOP":
      case "AmendSharesAndValuation":
      case "AmendValuation":
        bylaws.push(
          encodeBylaw(
            GovActionEscalation.CompanyLegalRep,
            ZERO_BN,
            ZERO_BN,
            ZERO_BN,
            ZERO_BN,
            bn(GovTokenVotingRule.NoVotingRights),
            GovActionLegalRep.None,
            GovActionLegalRep.None,
            false,
          ),
        );
        break;
      case "ExtraordinaryPayout":
      case "RegisterOffer":
      case "AmendGovernance":
      case "IssueTokensForExistingShares":
      case "IssueSharesForExistingTokens":
      case "EstablishAuthorizedCapital":
      case "AnnualGeneralMeeting":
        bylaws.push(
          encodeBylaw(
            GovActionEscalation.SHR,
            terms.GENERAL_VOTING_DURATION,
            terms.SHAREHOLDERS_VOTING_QUORUM_FRAC,
            terms.VOTING_MAJORITY_FRAC,
            ZERO_BN,
            terms.GENERAL_VOTING_RULE,
            GovActionLegalRep.CompanyLegalRep,
            GovActionLegalRep.CompanyLegalRep,
            false,
          ),
        );
        break;
      case "None":
        bylaws.push(
          encodeBylaw(
            GovActionEscalation.SHR,
            terms.GENERAL_VOTING_DURATION,
            terms.SHAREHOLDERS_VOTING_QUORUM_FRAC,
            terms.VOTING_MAJORITY_FRAC,
            ZERO_BN,
            terms.GENERAL_VOTING_RULE,
            GovActionLegalRep.CompanyLegalRep,
            GovActionLegalRep.CompanyLegalRep,
            true,
          ),
        );
        break;
      default:
        throw new Error(`Unknown action ${action}`);
    }
  }
  return bylaws;
}

export function applyBylawsToRights(terms, bylaws) {
  const modifiedTerms = Object.assign({}, terms);
  // drop properties transformed into bylaws
  [
    "GENERAL_VOTING_RULE",
    "TAG_ALONG_VOTING_RULE",
    "GENERAL_VOTING_DURATION",
    "RESTRICTED_ACT_VOTING_DURATION",
    "SHAREHOLDERS_VOTING_QUORUM_FRAC",
    "VOTING_MAJORITY_FRAC",
  ].forEach(e => delete modifiedTerms[e]);
  // add bylaws and voting rights flag
  modifiedTerms.HAS_VOTING_RIGHTS = hasVotingRights(terms.GENERAL_VOTING_RULE);
  modifiedTerms.ACTION_BYLAWS = bylaws.map(bylaw => new web3.BigNumber(bylaw, 16));
  return modifiedTerms;
}

export async function deployTokenholderRights(artifact, terms, fullTerms) {
  const defaults = fullTerms ? {} : defaultTokenholderTerms;
  let tokenholderTerms = Object.assign({}, defaults, terms || {});
  if (tokenholderTerms.ACTION_BYLAWS === undefined) {
    const bylaws = generateDefaultBylaws(tokenholderTerms);
    tokenholderTerms = applyBylawsToRights(tokenholderTerms, bylaws);
  }
  const [tokenholderTermsKeys, tokenholderTermsValues] = validateTerms(artifact, tokenholderTerms);
  const tokenholderRights = await artifact.new.apply(this, tokenholderTermsValues);
  return [tokenholderRights, tokenholderTerms, tokenholderTermsKeys, tokenholderTermsValues];
}

export async function deployDurationTerms(artifact, terms, fullTerms) {
  const defaults = fullTerms ? {} : defDurTerms;
  const durTerms = Object.assign({}, defaults, terms || {});
  const [durationTermsKeys, durationTermsValues] = validateTerms(artifact, durTerms);
  const etoDurationTerms = await artifact.new.apply(this, durationTermsValues);
  return [etoDurationTerms, durTerms, durationTermsKeys, durationTermsValues];
}

export async function deployTokenTerms(artifact, terms, fullTerms) {
  const defaults = fullTerms ? {} : defTokenTerms;
  const tokenTerms = Object.assign({}, defaults, terms || {});
  const [tokenTermsKeys, tokenTermsValues] = validateTerms(artifact, tokenTerms);
  const etoTokenTerms = await artifact.new.apply(this, tokenTermsValues);
  return [etoTokenTerms, tokenTerms, tokenTermsKeys, tokenTermsValues];
}

export async function deployETOTerms(
  universe,
  artifact,
  durationTerms,
  tokenTerms,
  tokenholderRights,
  termsConstraints,
  terms,
  fullTerms,
) {
  const defaults = fullTerms ? {} : defEtoTerms;
  const etoTerms = Object.assign({}, defaults, terms || {});
  etoTerms.UNIVERSE = universe.address;
  etoTerms.DURATION_TERMS = durationTerms.address;
  etoTerms.TOKEN_TERMS = tokenTerms.address;
  etoTerms.TOKENHOLDER_RIGHTS = tokenholderRights.address;
  etoTerms.ETO_TERMS_CONSTRAINTS = termsConstraints.address;
  const [termsKeys, termsValues] = validateTerms(artifact, etoTerms);
  const deployedTerms = await artifact.new.apply(this, termsValues);
  return [deployedTerms, etoTerms, termsKeys, termsValues];
}

export async function deployETOTermsConstraints(artifact, terms, fullTerms) {
  const defaults = fullTerms ? {} : defTermsConstraints;
  const constraintsTerms = Object.assign({}, defaults, terms || {});
  const [constraintsTermsKeys, constraintsTermsValues] = validateTerms(artifact, constraintsTerms);
  const etoTermsConstraints = await artifact.new.apply(this, constraintsTermsValues);
  return [etoTermsConstraints, constraintsTerms, constraintsTermsKeys, constraintsTermsValues];
}

export async function deployETOTermsConstraintsUniverse(admin, universe, artifact, terms) {
  const [
    etoTermsConstraints,
    constraintsTerms,
    constraintsTermsKeys,
    constraintsTermsValues,
  ] = await deployETOTermsConstraints(artifact, terms);
  // add the constraints to the universe
  await universe.setCollectionsInterfaces(
    [knownInterfaces.etoTermsConstraints],
    [etoTermsConstraints.address],
    [true],
    { from: admin },
  );
  return [etoTermsConstraints, constraintsTerms, constraintsTermsKeys, constraintsTermsValues];
}
