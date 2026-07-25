# Security Policy

## Supported Versions

Kravhantering follows a roll-forward security model. Security fixes are
implemented on `main` and become available in the first tagged release that
contains the fix. That release can also contain functional changes, breaking
changes, and other bug fixes already present on `main`.

The latest tagged release is supported until a newer tagged release is
published. Support does not mean that an existing tag receives fixes. Tagged
releases are never rebuilt, and fixes are not backported to earlier versions or
maintained release branches.

For example, a vulnerability affecting version 2.0 is resolved by upgrading to
version 2.1 or later. No security-fixed version of 2.0 is published.

<!-- markdownlint-disable MD013 -->
| Code line / release | Security status |
| --- | --- |
| `main` | Receives security fixes and is the source of the next tagged release. |
| Latest tagged release | Supported until the next tagged release is published; does not receive in-place fixes. |
| Older tagged releases | Unsupported; no fixes or backports are provided. |
<!-- markdownlint-enable MD013 -->

## Reporting a Vulnerability

We take the security of Kravhantering seriously. If you discover a security
vulnerability, we appreciate your help in disclosing it to us in a responsible
manner.

### Private Reporting (Recommended)

For sensitive security issues, please use GitHub's private vulnerability
reporting feature:

1. Navigate to the [Security tab](https://github.com/viscalyx/kravhantering/security)
   of this repository
1. Click on "Report a vulnerability"
1. Fill out the vulnerability report form with as much detail as possible

This method ensures that vulnerability details remain private until we've had a
chance to assess and address them.

### Alternative Reporting Methods

If you prefer not to use GitHub's reporting system, you can also:

- Create a private issue by contacting the repository maintainers directly
- Email security concerns to the project maintainers (contact information
  available in the repository)

### What to Include

When reporting a vulnerability, please include:

- **Description**: A clear description of the vulnerability
- **Steps to Reproduce**: Detailed steps to reproduce the issue
- **Impact**: Description of the potential impact of the vulnerability
- **Affected Components**: Which parts of the system are affected
- **Suggested Fix**: If you have ideas for how to fix the issue (optional)
- **Your Contact Information**: So we can follow up with questions if needed

### Response Timeline

We aim to respond to security reports according to the following timeline:

- **Initial Response**: Within 48 hours of receiving the report
- **Assessment**: Within 5 business days, we'll assess the severity and validity
- **Resolution**: We will make a _best-effort_ to address critical
  vulnerabilities within **14 calendar days** and all others within **45
  calendar days**. These timelines are subject to resource availability,
  including team capacity, workload, and the complexity of the issue. In cases
  where additional time is required, we will communicate updates to the reporter
  promptly.
- **Disclosure**: After the fix is deployed, we'll coordinate with you on
  public disclosure

## Security Measures

### Development Security

- **Dependency Management**: Regular security audits using `npm audit` and
  automated dependency updates
- **Code Review**: All code changes require review before merging.
  Security-sensitive paths are owned by `@viscalyx/security-reviewers` in
  [.github/CODEOWNERS](.github/CODEOWNERS), and security-sensitive pull
  requests must complete the SSDLC gate in the pull request body.
- **SSDLC Gate**: Pull requests that touch app code, APIs, migrations,
  authentication, authorization, logging, AI/MCP, workflows, dependencies, or
  personal data must record security requirements, test evidence, data
  protection impact, threat-model impact, and approval context.
- **Testing**: Comprehensive test coverage including security-focused tests
- **Linting**: Biome with recommended lint rules
- **Static Analysis**: TypeScript strict mode and additional static analysis
  tools

### Deployment Security

- **Content Security Policy (CSP)**: Strict CSP headers implemented
- **HTTPS Only**: All traffic is encrypted in transit
- **Dependency Scanning**: Automated scanning for known vulnerabilities
- **Environment Isolation**: Proper separation between development and
  production environments
- **Secrets Management**: Secure handling of API keys and sensitive
  configuration

### Infrastructure Security

- **Ingress Protection**: Uses the platform ingress, reverse proxy, or WAF
  controls provided by the target environment
- **Regular Updates**: Infrastructure and dependencies are regularly updated
- **Access Control**: Principle of least privilege for all system access
- **Monitoring**: Security monitoring and alerting in place

## Vulnerability Disclosure Policy

### Coordinated Disclosure

We follow a coordinated disclosure approach:

1. **Report received**: We acknowledge receipt of your vulnerability report
1. **Assessment**: We verify and assess the vulnerability
1. **Fix development**: We develop and test a fix
1. **Fix deployment**: We deploy the fix to production
1. **Public disclosure**: We work with you to publicly disclose the
   vulnerability details

### Recognition

We believe in recognizing security researchers who help make our project more
secure:

- **Credit**: With your permission, we'll credit you in our security advisories

## Security Best Practices for Contributors

If you're contributing to this project, please follow these security guidelines:

### Code Security

- **Input Validation**: Always validate and sanitize user inputs
- **XSS Prevention**: Use proper escaping and Content Security Policy
- **CSRF Protection**: Implement CSRF tokens for state-changing operations
- **SQL Injection**: If database functionality is added in the future, use
  parameterized queries and avoid dynamic SQL
- **Authentication**: Implement secure authentication and session management
- **Authorization**: Enforce proper access controls and permissions

### Dependencies

- **Minimal Dependencies**: Only add dependencies that are necessary
- **Trusted Sources**: Use packages from trusted maintainers with good security
  records
- **Regular Updates**: Keep dependencies updated to the latest secure versions
- **Vulnerability Scanning**: Run security scans before adding new dependencies

### Code Review

- **Security Focus**: Review code changes with security implications in mind
- **Security Ownership**: Changes under `.github/CODEOWNERS` security paths
  require `@viscalyx/security-reviewers` review before merge
- **Review Scope**: Security reviewers check input validation, authentication,
  authorization, audit redaction, personal-data exposure, migration risk, and
  security-test impact as applicable
- **SSDLC Evidence**: Security-sensitive pull requests must complete the
  SSDLC gate checklist and notes before merge. Use requirement IDs, test
  evidence, privacy impact, threat-model decision, and approval context in the
  pull request body.
- **Threat Modeling**: Consider potential attack vectors for new features
- **Testing**: Include security tests for security-sensitive functionality
- **Documentation**: Document security-related design decisions

## Contact Information

For security-related questions or concerns that don't require private reporting:

- **GitHub Issues**: For general security questions (not vulnerabilities)

## Acknowledgments

We would like to thank the following security researchers who have responsibly
disclosed vulnerabilities:

_No vulnerabilities have been reported yet._

---

Thank you for helping keep Kravhantering and our community safe!
