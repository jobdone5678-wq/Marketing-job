import rawCountries from '../profile-countries.json';

export interface CountryOption {
  code: string;
  name: string;
  flag: string;
  region: string;
}

export const COUNTRIES: CountryOption[] = rawCountries as CountryOption[];

// First 8 popular countries shown as direct pills (matches NextKinHR UI Image 4)
export const POPULAR_COUNTRY_CODES = ['al', 'dz', 'ad', 'ao', 'ar', 'am', 'au', 'at'];
export const LOCATION_STARTING_COUNTRIES = ['in', 'af', 'ax', 'al', 'dz', 'as', 'ad', 'ao'];

export interface CountryScreeningQuestion {
  id: string;
  countryCode: string;
  countryName: string;
  question: string;
  type: 'select' | 'text';
  options?: string[];
  placeholder?: string;
  helpText?: string;
}

/**
 * Returns dynamic screening questions customized for the selected countries.
 * For example:
 * - US triggers EEO, US Citizen/Permanent Resident status, H1B/TN visa sponsorship.
 * - UK triggers Right to Work & Skilled Worker Visa questions.
 * - EU countries trigger EU Blue Card & EEA work permit questions.
 * - India triggers PAN/Aadhaar compliance & authorization.
 * - Canada triggers Canadian Entitlement & LMIA questions.
 * - Any selected country triggers country-specific authorization & sponsorship questions.
 */
export function getCountrySpecificQuestions(selectedCodes: string[]): CountryScreeningQuestion[] {
  const questions: CountryScreeningQuestion[] = [];
  const map = new Map(COUNTRIES.map((c) => [c.code, c]));

  for (const code of selectedCodes) {
    const country = map.get(code);
    if (!country) continue;

    if (code === 'us') {
      questions.push(
        {
          id: 'us_auth',
          countryCode: 'us',
          countryName: 'United States',
          question: 'Are you legally authorized to work in the United States?',
          type: 'select',
          options: ['Not stated', 'Yes', 'No'],
          helpText: 'Indicates direct work authorization (e.g. US Citizen, Permanent Resident / Green Card, EAD).',
        },
        {
          id: 'us_sponsorship',
          countryCode: 'us',
          countryName: 'United States',
          question: 'Will you now or in the future require visa sponsorship to work in the United States?',
          type: 'select',
          options: ['Not stated', 'Yes', 'No'],
          helpText: 'Commonly asked for H-1B, TN, O-1 or OPT STEM extensions.',
        },
        {
          id: 'us_veteran',
          countryCode: 'us',
          countryName: 'United States',
          question: 'U.S. Equal Opportunity — Veteran status',
          type: 'select',
          options: [
            'Not stated',
            'I am not a protected veteran',
            'I identify as one or more of the classifications of protected veteran',
            'I do not wish to self-identify',
          ],
        },
        {
          id: 'us_disability',
          countryCode: 'us',
          countryName: 'United States',
          question: 'U.S. Equal Opportunity — Disability status',
          type: 'select',
          options: [
            'Not stated',
            'No, I do not have a disability',
            'Yes, I have a disability (or previously had a disability)',
            'I do not wish to answer',
          ],
        }
      );
    } else if (code === 'gb') {
      questions.push(
        {
          id: 'gb_right_to_work',
          countryCode: 'gb',
          countryName: 'United Kingdom',
          question: 'Do you currently have the permanent Right to Work in the UK?',
          type: 'select',
          options: ['Not stated', 'Yes', 'No'],
        },
        {
          id: 'gb_sponsorship',
          countryCode: 'gb',
          countryName: 'United Kingdom',
          question: 'Do you require UK Skilled Worker visa sponsorship now or in the future?',
          type: 'select',
          options: ['Not stated', 'Yes', 'No'],
        }
      );
    } else if (code === 'ca') {
      questions.push(
        {
          id: 'ca_entitled',
          countryCode: 'ca',
          countryName: 'Canada',
          question: 'Are you legally entitled to work in Canada?',
          type: 'select',
          options: ['Not stated', 'Yes', 'No'],
        },
        {
          id: 'ca_sponsorship',
          countryCode: 'ca',
          countryName: 'Canada',
          question: 'Will you require LMIA or Canadian employer sponsorship?',
          type: 'select',
          options: ['Not stated', 'Yes', 'No'],
        }
      );
    } else if (country.region === 'eu') {
      questions.push({
        id: `${code}_eu_auth`,
        countryCode: code,
        countryName: country.name,
        question: `Do you have work authorization or an EU Blue Card in ${country.name}?`,
        type: 'select',
        options: [
          'Not stated',
          'Yes (Citizen / EU National)',
          'Yes (Valid Work Permit / Blue Card)',
          'No (Sponsorship required)',
        ],
      });
    } else if (code === 'in') {
      questions.push(
        {
          id: 'in_auth',
          countryCode: 'in',
          countryName: 'India',
          question: 'Are you authorized to work in India (Citizen / OCI / valid work visa)?',
          type: 'select',
          options: ['Not stated', 'Yes', 'No'],
        },
        {
          id: 'in_tax_residency',
          countryCode: 'in',
          countryName: 'India',
          question: 'Do you hold a valid PAN and Aadhaar for Indian employment payroll?',
          type: 'select',
          options: ['Not stated', 'Yes', 'No'],
        }
      );
    } else if (code === 'au') {
      questions.push({
        id: 'au_auth',
        countryCode: 'au',
        countryName: 'Australia',
        question: 'What is your Australian work rights status?',
        type: 'select',
        options: [
          'Not stated',
          'Australian Citizen',
          'Permanent Resident',
          'Full Working Rights Visa',
          'Visa requiring employer sponsorship',
        ],
      });
    } else {
      questions.push(
        {
          id: `${code}_auth`,
          countryCode: code,
          countryName: country.name,
          question: `Are you legally authorized to work in ${country.name}?`,
          type: 'select',
          options: ['Not stated', 'Yes', 'No'],
        },
        {
          id: `${code}_sponsor`,
          countryCode: code,
          countryName: country.name,
          question: `Do you require visa sponsorship for employment in ${country.name}?`,
          type: 'select',
          options: ['Not stated', 'Yes', 'No'],
        }
      );
    }
  }

  return questions;
}
