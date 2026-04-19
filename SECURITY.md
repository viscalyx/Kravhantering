# Security Policy

## Supported Versions

We actively support and provide security updates for the following versions of
Kravhantering:

<!-- markdownlint-disable MD013 -->
| Branch / Release          | Security-supported? |
| ------------------------- | ------------------- |
| `main` (latest)           | :white_check_mark:  |
| Latest tagged release.    | :x:                 |
<!-- markdownlint-enable MD013 -->

The latest version in the main branch is what is normally published
automatically.

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
- **Code Review**: All code changes require review before merging
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

- **Cloudflare Protection**: DDoS protection and Web Application Firewall (WAF)
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
