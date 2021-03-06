ngapp.controller('installedThemesController', function($scope, extensionService, settingsService) {
    $scope.themes = extensionService.getInstalledThemes();

    // scope functions
    $scope.applyTheme = function(theme) {
        $scope.themes.forEach((theme) => theme.applied = false);
        theme.applied = true;
        $scope.$emit('setTheme', theme.filename);
        settingsService.globalSettings.theme = theme.filename;
        settingsService.saveGlobalSettings();
    };

    $scope.uninstallTheme = function(theme) {
        if (theme.applied) {
            let otherTheme = $scope.themes.find((t) => { return t !== theme});
            $scope.applyTheme(otherTheme);
        }
        fs.jetpack.remove(`themes\\${theme.filename}`);
        $scope.themes.remove(theme);
    };

    $scope.openRepo = function(module) {
        fh.openUrl(module.repo);
    };

    $scope.installTheme = function() {
        let themeFile = fh.selectFile('Select a theme to install.', '', [
            { name: 'Archive', extensions: ['zip'] },
            { name: 'Theme CSS File', extensions: ['css'] }
        ]);
        if (!themeFile) return;
        try {
            extensionService.installTheme(themeFile);
            $scope.themes = extensionService.getInstalledThemes(true);
        } catch (x) {
            alert(`Error installing theme:\r\n${x.stack}`);
        }
    };
});
