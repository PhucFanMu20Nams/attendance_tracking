import Team from '../models/Team.js';

/**
 * Get all teams for filters/dropdowns.
 * Roles: EMPLOYEE | MANAGER | ADMIN (any authenticated user)
 * 
 * @route GET /api/teams
 * @returns {Object} { items: [{ _id, name }] }
 */
export const getAllTeams = async (req, res) => {
    try {
        // Query all teams, select only necessary fields, sort alphabetically
        const teams = await Team.find()
            .select('_id name')
            .sort({ name: 1 })
            .lean();

        return res.status(200).json({ items: teams });
    } catch (error) {
        // OWASP A05/A09: Verbose logging in dev, generic in prod
        if (process.env.NODE_ENV !== 'production') {
            console.error('Error fetching teams:', error);
        } else {
            console.error('Error fetching teams');
        }
        return res.status(500).json({ message: 'Internal server error' });
    }
};
