import { Badger, BadgerProps } from '../src/badger';

// Mock the GitHub Actions core and github modules
jest.mock('@actions/core');
jest.mock('@actions/github', () => ({
  getOctokit: jest.fn(),
  context: {
    repo: { owner: 'test-org', repo: 'test-repo' },
    payload: {
      pull_request: { number: 123 },
    },
  },
}));

// Create a concrete implementation of the abstract Badger class for testing
class TestBadger extends Badger {
  public async runBadgerWorkflow(): Promise<void> {
    // Implementation not needed for these tests
  }

  public determineRating(pullRequests: any[], _username?: string): number {
    return pullRequests.length;
  }

  // Expose the protected method for testing
  public async testIgnoreThisUsername(username: string): Promise<boolean> {
    return this.ignoreThisUsername(username);
  }
}

describe('Badger ignore functionality', () => {
  let mockOctokit: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock octokit
    mockOctokit = {
      rest: {
        teams: {
          getMembershipForUserInOrg: jest.fn(),
        },
      },
    };

    // Mock getOctokit to return our mock
    const { getOctokit } = jest.requireMock('@actions/github');
    getOctokit.mockReturnValue(mockOctokit);
  });

  describe('ignore-usernames functionality', () => {
    it('should ignore users in the ignore-usernames list', async () => {
      const props: BadgerProps = {
        token: 'fake-token',
        badges: ['badge1'],
        thresholds: [0],
        ignoreUsernames: ['user1', 'user2'],
      };

      const badger = new TestBadger(props);

      expect(await badger.testIgnoreThisUsername('user1')).toBe(true);
      expect(await badger.testIgnoreThisUsername('user2')).toBe(true);
      expect(await badger.testIgnoreThisUsername('user3')).toBe(false);
    });
  });

  describe('ignore-team functionality', () => {
    it('should ignore users who are members of the specified team', async () => {
      const props: BadgerProps = {
        token: 'fake-token',
        badges: ['badge1'],
        thresholds: [0],
        ignoreUsernames: [],
        ignoreTeam: 'test-org/maintainers',
      };

      // Mock successful team membership check
      mockOctokit.rest.teams.getMembershipForUserInOrg.mockResolvedValue({
        status: 200,
      });

      const badger = new TestBadger(props);

      const result = await badger.testIgnoreThisUsername('team-member');

      expect(result).toBe(true);
      expect(mockOctokit.rest.teams.getMembershipForUserInOrg).toHaveBeenCalledWith({
        org: 'test-org',
        team_slug: 'maintainers',
        username: 'team-member',
      });
    });

    it('should not ignore users who are not members of the specified team', async () => {
      const props: BadgerProps = {
        token: 'fake-token',
        badges: ['badge1'],
        thresholds: [0],
        ignoreUsernames: [],
        ignoreTeam: 'test-org/maintainers',
      };

      // Mock 404 response (user not a team member)
      mockOctokit.rest.teams.getMembershipForUserInOrg.mockRejectedValue({
        status: 404,
      });

      const badger = new TestBadger(props);

      const result = await badger.testIgnoreThisUsername('non-member');

      expect(result).toBe(false);
      expect(mockOctokit.rest.teams.getMembershipForUserInOrg).toHaveBeenCalledWith({
        org: 'test-org',
        team_slug: 'maintainers',
        username: 'non-member',
      });
    });

    it('should handle invalid team format gracefully', async () => {
      const props: BadgerProps = {
        token: 'fake-token',
        badges: ['badge1'],
        thresholds: [0],
        ignoreUsernames: [],
        ignoreTeam: 'invalid-format',
      };

      const badger = new TestBadger(props);

      const result = await badger.testIgnoreThisUsername('any-user');

      expect(result).toBe(false);
      // Should not call the API with invalid format
      expect(mockOctokit.rest.teams.getMembershipForUserInOrg).not.toHaveBeenCalled();
    });

    it('should prioritize ignore-usernames over team membership', async () => {
      const props: BadgerProps = {
        token: 'fake-token',
        badges: ['badge1'],
        thresholds: [0],
        ignoreUsernames: ['priority-user'],
        ignoreTeam: 'test-org/maintainers',
      };

      const badger = new TestBadger(props);

      const result = await badger.testIgnoreThisUsername('priority-user');

      expect(result).toBe(true);
      // Should not call team API since user is already in ignore list
      expect(mockOctokit.rest.teams.getMembershipForUserInOrg).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      const props: BadgerProps = {
        token: 'fake-token',
        badges: ['badge1'],
        thresholds: [0],
        ignoreUsernames: [],
        ignoreTeam: 'test-org/maintainers',
      };

      // Mock 403 response (permission denied)
      mockOctokit.rest.teams.getMembershipForUserInOrg.mockRejectedValue({
        status: 403,
        message: 'Forbidden',
      });

      const badger = new TestBadger(props);

      const result = await badger.testIgnoreThisUsername('some-user');

      expect(result).toBe(false);
    });
  });

  describe('combined ignore functionality', () => {
    it('should work with both ignore-usernames and ignore-team', async () => {
      const props: BadgerProps = {
        token: 'fake-token',
        badges: ['badge1'],
        thresholds: [0],
        ignoreUsernames: ['individual-user'],
        ignoreTeam: 'test-org/maintainers',
      };

      // Mock team member check
      mockOctokit.rest.teams.getMembershipForUserInOrg.mockResolvedValue({
        status: 200,
      });

      const badger = new TestBadger(props);

      // Should ignore individual user
      expect(await badger.testIgnoreThisUsername('individual-user')).toBe(true);

      // Should ignore team member
      expect(await badger.testIgnoreThisUsername('team-member')).toBe(true);

      // Should not ignore non-member, non-listed user
      mockOctokit.rest.teams.getMembershipForUserInOrg.mockRejectedValue({
        status: 404,
      });
      expect(await badger.testIgnoreThisUsername('regular-user')).toBe(false);
    });
  });
});
