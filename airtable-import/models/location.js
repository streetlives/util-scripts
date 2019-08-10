module.exports = (sequelize, DataTypes) => {
  const Location = sequelize.define('Location', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: DataTypes.TEXT,
    description: DataTypes.TEXT,
    transportation: DataTypes.TEXT,
    position: DataTypes.GEOMETRY,
    additional_info: DataTypes.TEXT,
    hidden_from_search: DataTypes.BOOLEAN,
  }, {
    underscored: true,
    underscoredAll: true,
    hooks: {
      beforeFind: (options) => {
        const isSearchingBySpecificId = options.where.id != null;
        if (!isSearchingBySpecificId) {
          // Mutating args is awful, but is how sequelize hooks officially work:
          // http://docs.sequelizejs.com/manual/tutorial/hooks.html.
          // eslint-disable-next-line no-param-reassign
          options.where.hidden_from_search = { [sequelize.Op.or]: [false, null] };
        }
        return options;
      },
    },
  });

  Location.associate = (models) => {
    Location.belongsTo(models.Organization);
    Location.belongsToMany(models.Service, { through: models.ServiceAtLocation });
    Location.belongsToMany(models.Language, { through: models.LocationLanguages });
    Location.hasMany(models.PhysicalAddress);
    Location.hasMany(models.Phone);
    Location.hasMany(models.RegularSchedule);
    Location.hasMany(models.HolidaySchedule);
    Location.hasMany(models.AccessibilityForDisabilities);
    Location.hasMany(models.Comment);

    // Can't just set defaultScope on the initial model definition:
    // https://github.com/sequelize/sequelize/issues/6245.
    Location.addScope('defaultScope', {
      attributes: { exclude: ['hidden_from_search'] },
    }, { override: true });
  };

  return Location;
};
