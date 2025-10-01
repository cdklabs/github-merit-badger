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

  describe('ignore-teams functionality', () => {
    it('should handle single and multiple teams with proper validation and early return', async () => {
      const props: BadgerProps = {
        token: 'fake-token',
        badges: ['badge1'],
        thresholds: [0],
        ignoreUsernames: ['priority-user'],
        ignoreTeams: ['test-org/maintainers', 'test-org/admins', 'invalid-format'],
      };

      const badger = new TestBadger(props);

      // Mock team membership API
      mockOctokit.rest.teams.getMembershipForUserInOrg.mockImplementation(({ team_slug, username }: any) => {
        if (username === 'team-member' && team_slug === 'admins') {
          return Promise.resolve({ status: 200 });
        }
        return Promise.reject({ status: 404 });
      });

      // ignore-usernames check (first it checks the ignore usr list)
      mockOctokit.rest.teams.getMembershipForUserInOrg.mockClear();
      expect(await badger.testIgnoreThisUsername('priority-user')).toBe(true);
      expect(mockOctokit.rest.teams.getMembershipForUserInOrg).not.toHaveBeenCalled();

      // User found in second team (early return after second team)
      mockOctokit.rest.teams.getMembershipForUserInOrg.mockClear();
      expect(await badger.testIgnoreThisUsername('team-member')).toBe(true);
      expect(mockOctokit.rest.teams.getMembershipForUserInOrg).toHaveBeenCalledTimes(2);

      // User not in any team (all teams checked, invalid format skipped)
      mockOctokit.rest.teams.getMembershipForUserInOrg.mockClear();
      expect(await badger.testIgnoreThisUsername('regular-user')).toBe(false);
      expect(mockOctokit.rest.teams.getMembershipForUserInOrg).toHaveBeenCalledTimes(2);

      // Empty teams array
      const emptyTeamsProps: BadgerProps = {
        token: 'fake-token',
        badges: ['badge1'],
        thresholds: [0],
        ignoreUsernames: [],
        ignoreTeams: [],
      };
      const emptyBadger = new TestBadger(emptyTeamsProps);
      mockOctokit.rest.teams.getMembershipForUserInOrg.mockClear();
      expect(await emptyBadger.testIgnoreThisUsername('any-user')).toBe(false);
      expect(mockOctokit.rest.teams.getMembershipForUserInOrg).not.toHaveBeenCalled();
    });

    it('should handle API errors and edge cases gracefully', async () => {
      const props: BadgerProps = {
        token: 'fake-token',
        badges: ['badge1'],
        thresholds: [0],
        ignoreUsernames: [],
        ignoreTeams: ['test-org/private-team', 'test-org/public-team'],
      };

      const badger = new TestBadger(props);

      // Mock API errors for different scenarios
      mockOctokit.rest.teams.getMembershipForUserInOrg.mockImplementation(({ team_slug }: any) => {
        if (team_slug === 'private-team') {
          return Promise.reject({ status: 403, message: 'Forbidden' });
        } else if (team_slug === 'public-team') {
          return Promise.resolve({ status: 200 });
        }
        return Promise.reject({ status: 404 });
      });

      // Should handle 403 error and continue to check next team
      const result = await badger.testIgnoreThisUsername('test-user');
      expect(result).toBe(true);
      expect(mockOctokit.rest.teams.getMembershipForUserInOrg).toHaveBeenCalledTimes(2);

      // Test undefined teams
      const undefinedTeamsProps: BadgerProps = {
        token: 'fake-token',
        badges: ['badge1'],
        thresholds: [0],
        ignoreUsernames: [],
        // ignoreTeams is undefined
      };
      const undefinedBadger = new TestBadger(undefinedTeamsProps);
      mockOctokit.rest.teams.getMembershipForUserInOrg.mockClear();
      expect(await undefinedBadger.testIgnoreThisUsername('any-user')).toBe(false);
      expect(mockOctokit.rest.teams.getMembershipForUserInOrg).not.toHaveBeenCalled();
    });
  });

});
