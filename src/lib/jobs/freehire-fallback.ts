import type { Job, FacetsData } from './freehire-types';

export const REDCARE_PHARMACY_JOB: Job = {
  public_slug: 'engineering-manager-m-f-d-redcare-pharmacy',
  title: 'Engineering Manager (m/f/d)',
  company: 'Redcare Pharmacy',
  company_slug: 'redcare-pharmacy',
  location: 'Munich, Bavaria',
  work_mode: 'remote',
  countries: ['de'],
  regions: ['europe'],
  source: 'linkedin',
  source_url: 'https://www.linkedin.com/jobs/view/engineering-manager-redcare-pharmacy',
  url: 'https://jobs.redcare-pharmacy.com/jobs/engineering-manager',
  posted_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
  created_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
  updated_at: new Date(Date.now() - 24 * 60 * 1000).toISOString(),
  skills: [
    'Agile',
    'Automation',
    'Cloud',
    'Cloud Native',
    'E-commerce',
    'Microservices',
    'Observability',
    'Performance Management',
  ],
  upvote_count: 14,
  downvote_count: 1,
  my_vote: 0,
  reality: {
    class: 'fresh',
  },
  enrichment: {
    category: 'software_engineering',
    work_mode: 'remote',
    company_type: 'product',
    domains: ['healthcare', 'e-commerce'],
    summary:
      "Lead multiple cross-functional engineering teams at Redcare Pharmacy, Europe's No.1 e-pharmacy, providing direction, coaching engineers, and partnering with Product to deliver customer-facing products and internal platforms built as cloud-native microservices. A people-leadership role, explicitly not an IC position.",
    skills: [
      'Agile',
      'Automation',
      'Cloud',
      'Cloud Native',
      'E-commerce',
      'Microservices',
      'Observability',
      'Performance Management',
    ],
    requirements: [
      {
        text: 'Experience leading multiple engineering teams in a product-oriented environment',
        priority: 'required',
      },
      {
        text: 'Strong track record of creating direction, driving execution, and achieving measurable outcomes',
        priority: 'required',
      },
      {
        text: 'Familiarity with cloud-native architectures, modern software engineering practices, and agile product development',
        priority: 'required',
      },
      {
        text: 'Sufficient technical depth to recognize what good looks like and guide teams towards sound decisions',
        priority: 'required',
      },
      {
        text: 'Experience in e-commerce is a plus',
        priority: 'preferred',
      },
    ],
  },
  description: `
    <h2>About Redcare Pharmacy:</h2>
    <p>As Europe's No.1 e-pharmacy, Redcare Pharmacy is powered by passionate teams and cutting-edge innovation. We strive to create a healthy, collaborative work environment where every employee feels valued and inspired to contribute to our vision "Until every human has their health". If you're seeking a career that offers purpose and aligns with your values, join us and begin your #Redcareer today.</p>

    <h2>About the role:</h2>
    <p>As an Engineering Manager (m/f/d), you will lead multiple cross-functional engineering teams responsible for customer-facing products and internal platforms. You will provide clear direction, empower teams to take ownership, and ensure that engineering priorities translate into reliable delivery and measurable impact. Working closely with Product and business stakeholders, you will help shape solutions that create customer and business value.</p>

    <h2>Additional Information</h2>
    <h3>About your benefits:</h3>
    <p>In order to provide our employees with the best possible support for their individual needs, we offer a wide range of benefits:</p>
    <ul>
      <li><strong>Sports:</strong> Stay healthy. Profit from a membership (M) package at Urban Sports Club, so that you can take advantage of a huge variety of sport offers.</li>
      <li><strong>Mental Health:</strong> Get quick and professional help from psychologists of Likeminded if you feel overwhelmed in private or professional life. Anonymous and free of charge.</li>
      <li><strong>Work from Home:</strong> If your job does not require you to be present in the office, we can arrange the place you work from individually - even for up to 20 days a year anywhere in the EU.</li>
      <li><strong>Mobility:</strong> We provide our employees with a fully costed Deutschland Ticket which can be used at any time. Click here to learn more.</li>
      <li><strong>Personal development:</strong> Grow! We support and encourage your individual development through various in- and external trainings.</li>
      <li>And many more :)</li>
    </ul>
  `,
};

export const FALLBACK_JOBS: Job[] = [
  REDCARE_PHARMACY_JOB,
  {
    public_slug: 'senior-software-engineer-distributed-systems-datadog',
    title: 'Senior Software Engineer - Distributed Systems',
    company: 'Datadog',
    company_slug: 'datadog',
    location: 'Berlin, Germany',
    work_mode: 'hybrid',
    countries: ['de'],
    regions: ['europe'],
    source: 'greenhouse',
    source_url: 'https://boards.greenhouse.io/datadog/jobs/482910',
    url: 'https://www.datadoghq.com/careers/detail/?gh_jid=482910',
    posted_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
    skills: ['Go', 'Kubernetes', 'Kafka', 'Distributed Systems', 'Python'],
    upvote_count: 22,
    downvote_count: 0,
    my_vote: 0,
    reality: { class: 'fresh' },
    enrichment: {
      category: 'software_engineering',
      work_mode: 'hybrid',
      company_type: 'product',
      domains: ['developer_tools', 'cloud'],
      summary:
        'Build and operate petabyte-scale distributed streaming pipelines powering Datadog APM and real-time observability telemetry across global multi-cloud clusters.',
      skills: ['Go', 'Kubernetes', 'Kafka', 'Distributed Systems', 'Python'],
      requirements: [
        { text: '5+ years building distributed backend services in Go or Java', priority: 'required' },
        { text: 'Hands-on experience with Kafka or distributed log architectures', priority: 'required' },
        { text: 'Deep understanding of Linux systems and networking internals', priority: 'required' },
      ],
    },
    description: `
      <h2>About Datadog</h2>
      <p>Datadog is the monitoring and security platform for cloud applications. We bring together data from servers, containers, databases, and third-party services to make your stack entirely observable.</p>
      <h2>The Opportunity</h2>
      <p>As a Senior Software Engineer on Distributed Systems, you will design and build massive data ingestion pipelines processing tens of millions of events per second with sub-second latency.</p>
    `,
  },
  {
    public_slug: 'staff-backend-engineer-core-infrastructure-spotify',
    title: 'Staff Backend Engineer - Core Infrastructure',
    company: 'Spotify',
    company_slug: 'spotify',
    location: 'Stockholm, Sweden',
    work_mode: 'remote',
    countries: ['se'],
    regions: ['europe'],
    source: 'ashby',
    source_url: 'https://jobs.ashbyhq.com/spotify/492019',
    url: 'https://www.lifeatspotify.com/jobs/staff-backend-engineer',
    posted_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    created_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    skills: ['Java', 'Microservices', 'GCP', 'System Design', 'Docker'],
    upvote_count: 31,
    downvote_count: 2,
    my_vote: 0,
    reality: { class: 'fresh' },
    enrichment: {
      category: 'backend',
      work_mode: 'remote',
      company_type: 'product',
      domains: ['media', 'entertainment'],
      summary:
        'Architect high-scale platform services serving over 600M active listeners worldwide. Define backend engineering standards and scale cloud native microservices on GCP.',
      skills: ['Java', 'Microservices', 'GCP', 'System Design', 'Docker'],
      requirements: [
        { text: 'Extensive experience in backend architecture and Java/Kotlin', priority: 'required' },
        { text: 'Proven experience operating large-scale systems in GCP or AWS', priority: 'required' },
        { text: 'Strong mentor capable of guiding senior and principal engineers', priority: 'required' },
      ],
    },
    description: `
      <h2>About Spotify</h2>
      <p>Our mission is to unlock the potential of human creativity—by giving a million creative artists the opportunity to live off their art and billions of fans the opportunity to enjoy and be inspired by it.</p>
    `,
  },
  {
    public_slug: 'staff-frontend-engineer-developer-platform-stripe',
    title: 'Staff Frontend Engineer - Developer Platform',
    company: 'Stripe',
    company_slug: 'stripe',
    location: 'Dublin, Ireland',
    work_mode: 'remote',
    countries: ['ie'],
    regions: ['europe'],
    source: 'greenhouse',
    source_url: 'https://boards.greenhouse.io/stripe/jobs/591028',
    url: 'https://stripe.com/jobs/listing/staff-frontend-engineer',
    posted_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
    created_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    skills: ['React', 'TypeScript', 'GraphQL', 'Next.js', 'Design Systems'],
    upvote_count: 45,
    downvote_count: 1,
    my_vote: 0,
    reality: { class: 'fresh' },
    enrichment: {
      category: 'frontend',
      work_mode: 'remote',
      company_type: 'product',
      domains: ['fintech', 'payments'],
      summary:
        "Build the world's most intuitive and responsive payment interfaces and developer portals. Craft reusable component libraries and robust TypeScript foundations for millions of businesses.",
      skills: ['React', 'TypeScript', 'GraphQL', 'Next.js', 'Design Systems'],
      requirements: [
        { text: 'Mastery of modern TypeScript, React, and browser performance optimization', priority: 'required' },
        { text: 'Track record designing scalable component systems and accessible UIs', priority: 'required' },
      ],
    },
    description: `
      <h2>About Stripe</h2>
      <p>Stripe is a financial infrastructure platform for businesses. Millions of companies—from the world's largest enterprises to the most ambitious startups—use Stripe to accept payments, grow their revenue, and accelerate new business opportunities.</p>
    `,
  },
  {
    public_slug: 'senior-fullstack-engineer-nextjs-ai-vercel',
    title: 'Senior Fullstack Engineer - Next.js AI',
    company: 'Vercel',
    company_slug: 'vercel',
    location: 'San Francisco, CA',
    work_mode: 'remote',
    countries: ['us'],
    regions: ['north_america'],
    source: 'lever',
    source_url: 'https://jobs.lever.co/vercel/901238',
    url: 'https://vercel.com/careers/senior-fullstack-ai',
    posted_at: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
    created_at: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 7 * 3600 * 1000).toISOString(),
    skills: ['Next.js', 'TypeScript', 'AI Engineering', 'TailwindCSS', 'Node.js'],
    upvote_count: 58,
    downvote_count: 0,
    my_vote: 0,
    reality: { class: 'fresh' },
    enrichment: {
      category: 'fullstack',
      work_mode: 'remote',
      company_type: 'product',
      domains: ['developer_tools', 'ai'],
      summary:
        'Push the envelope on AI SDK and Next.js server actions. Build fluid, state-of-the-art interactive web experiences empowering millions of web developers.',
      skills: ['Next.js', 'TypeScript', 'AI Engineering', 'TailwindCSS', 'Node.js'],
      requirements: [
        { text: 'Deep expertise in React Server Components, Next.js, and modern fullstack architecture', priority: 'required' },
        { text: 'Experience shipping generative UI or LLM integrations in production', priority: 'required' },
      ],
    },
    description: `
      <h2>About Vercel</h2>
      <p>Vercel's Frontend Cloud provides the developer experience and infrastructure to build, scale, and secure a faster, more personalized web.</p>
    `,
  },
];

export const FALLBACK_FACETS: FacetsData = {
  total: 190459,
  facets: {
    category: {
      software_engineering: 84200,
      fullstack: 28100,
      backend: 34500,
      frontend: 21200,
      devops: 18400,
      data_engineering: 15300,
      ai_engineering: 9800,
      product: 8900,
      design: 7600,
      security: 5400,
    },
    work_mode: {
      remote: 92300,
      hybrid: 58200,
      onsite: 39959,
    },
    countries: {
      de: 24500,
      us: 68200,
      gb: 31400,
      nl: 14200,
      fr: 12800,
      es: 9800,
      se: 7600,
      ie: 6200,
      pl: 8100,
      ch: 5400,
    },
    skills: {
      agile: 45000,
      cloud: 42000,
      python: 39000,
      react: 36000,
      typescript: 34000,
      kubernetes: 31000,
      microservices: 28000,
      go: 25000,
      automation: 22000,
      'e-commerce': 14000,
    },
  },
};
