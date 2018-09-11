ngapp.service('mergeBuilder', function($q, mergeLogger, mergeService, recordMergingService, mergeDataService, mergeAssetService, mergeIntegrationService, seqService, mergeLoadService, progressService) {
    const mastersPath = 'File Header\\Master Files';

    let mergesToBuild = [],
        buildIndex;

    // helpers
    let tryPromise = function(action, onSuccess, onFailure) {
        action.then(function() {
            try {
                onSuccess();
            } catch (x) {
                onFailure(x.stack);
            }
        }, onFailure);
    };

    // INITIALIZATION
    let storePluginHandles = function(merge) {
        merge.plugins.forEach(plugin => {
            plugin.handle = xelib.FileByName(plugin.filename);
        });
    };

    let releasePluginHandles = function(merge) {
        merge.plugins.forEach(plugin => {
            plugin.handle && xelib.Release(plugin.handle);
        });
    };

    let prepareMergedPlugin = function(merge) {
        merge.plugin = xelib.AddFile(merge.filename);
        mergeLogger.log(`Merging into ${merge.filename}`);
    };

    let addMastersToMergedPlugin = function(merge) {
        xelib.AddAllMasters(merge.plugin);
        mergeLogger.log(`Added masters to merged plugin`);
    };

    let addMastersToPlugins = function(merge) {
        merge.plugins.forEach(plugin => {
            xelib.AddMaster(plugin.handle, merge.filename);
        });
        mergeLogger.log(`Added ${merge.filename} as a master to the plugins being merged`);
    };

    let removeOldMergeFiles = function(merge) {
        progressService.progressMessage('Deleting old merge files');
        fh.jetpack.remove(merge.dataPath);
        let dataPath = xelib.GetGlobal('DataPath');
        fh.jetpack.remove(dataPath + merge.filename);
    };

    let prepareMerge = function(merge) {
        let prepared = $q.defer();
        merge.dataPath = mergeService.getMergeDataPath(merge);
        merge.failedToCopy = [];
        removeOldMergeFiles(merge);
        mergeLogger.init(`${merge.dataPath}\\merge`);
        mergeLogger.log(`\r\nBuilding merge ${merge.name}`);
        mergeLogger.log(`Merge Folder: ${merge.dataPath}`);
        mergeLogger.log(`Merge Method: ${merge.method || 'Clamp'}`);
        tryPromise(mergeLoadService.loadPlugins(merge), () => {
            mergeLogger.progress('Preparing merge...', true);
            storePluginHandles(merge);
            mergeDataService.buildMergeData(merge);
            prepareMergedPlugin(merge);
            merge.method === 'Master' ? addMastersToPlugins(merge) :
                addMastersToMergedPlugin(merge);
            prepared.resolve('Merged prepared');
        }, prepared.reject);
        return prepared.promise;
    };

    // FINALIZATION
    let removePluginMasters = function(merge) {
        mergeLogger.progress('Removing masters from merge...', true);
        let masters = xelib.GetElement(merge.plugin, mastersPath);
        merge.plugins.forEach(plugin => {
            mergeLogger.log(`Removing master ${plugin.filename}`);
            xelib.RemoveArrayItem(masters, '', 'MAST', plugin.filename);
        });
    };

    let saveMergeFiles = function(merge) {
        mergeLogger.progress('Saving merge files...');
        seqService.buildSeqFile(merge);
        mergeLogger.log('Saving merged plugin');
        xelib.SaveFile(merge.plugin, `${merge.dataPath}\\${merge.filename}`);
        merge.dateBuilt = new Date();
        mergeLogger.log('Saving additional merge data');
        mergeService.saveMergeData(merge);
    };

    let finalizeMerge = function(merge) {
        mergeIntegrationService.runIntegrations(merge);
        removePluginMasters(merge);
        saveMergeFiles(merge);
        mergeLogger.log(`Completed merge ${merge.name}.`);
        mergeLogger.close();
    };

    let cleanupMerge = function(merge) {
        mergeAssetService.cleanup(merge);
        releasePluginHandles(merge);
        merge.plugin && xelib.Release(merge.plugin);
    };

    // builder
    let progressDone = function(err, merge) {
        cleanupMerge(merge);
        let msg = err ? `${merge.name} failed to build` :
            `${mergesToBuild.length} merges built successfully`;
        progressService.progressTitle(msg);
        progressService.progressMessage(err ? 'Error' : 'All Done!');
        if (err) progressService.progressError(`${msg}:\n${err}`);
        progressService.allowClose();
    };

    let buildMerge = function(merge) {
        let progress = `${merge.name} (${buildIndex}/${mergesToBuild.length})`;
        progressService.progressTitle(`Building merge ${progress}`);
        tryPromise(prepareMerge(merge), () => {
            recordMergingService.mergeRecords(merge);
            mergeAssetService.handleAssets(merge);
            finalizeMerge(merge);
            buildNextMerge();
        }, err => progressDone(err, merge));
    };

    let buildNextMerge = function() {
        if (buildIndex >= mergesToBuild.length)
            return progressService.allowClose();
        buildMerge(mergesToBuild[buildIndex++]);
    };

    // PUBLIC API
    this.buildMerges = function(merges) {
        mergesToBuild = merges;
        buildIndex = 0;
        progressService.showProgress({
            determinate: true,
            title: 'Building Merges',
            message: 'Initializing...',
            logName: 'merge',
            current: 0,
            max: merges.reduce((sum, merge) => {
                return sum + merge.plugins.length + 6;
            }, 0)
        });
        buildNextMerge();
    };
});
