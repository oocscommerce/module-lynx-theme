<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Test\Unit\Helper;

use Magento\Framework\Component\ComponentRegistrar;
use Magento\Framework\Component\ComponentRegistrarInterface;
use Magento\Framework\Filesystem\DirectoryList;
use Magento\Framework\Filesystem\Driver\File as FileDriver;
use Magento\Framework\Module\ModuleListInterface;
use Magento\Framework\Serialize\Serializer\Json;
use OOCS\LynxTheme\Helper\BuildManifest;
use OOCS\LynxTheme\Helper\ThemeDependencies;
use PHPUnit\Framework\TestCase;

/**
 * The meta-package of a theme, on a project tree made in a temporary folder
 */
class ThemeDependenciesTest extends TestCase
{
    /**
     * The temporary project root
     *
     * @var string
     */
    private string $root;

    /**
     * @var FileDriver
     */
    private FileDriver $driver;

    /**
     * @var ThemeDependencies
     */
    private ThemeDependencies $dependencies;

    /**
     * Blank and Vue (child of Blank) themes; the kit, a module with packages, one without client code, a disabled one
     *
     * @return void
     */
    protected function setUp(): void
    {
        $this->driver = new FileDriver();
        $this->root = sys_get_temp_dir() . '/lynx-deps-' . uniqid();

        $blank = $this->root . '/packages/theme-blank';
        $vue = $this->root . '/packages/theme-vue';
        $this->write($blank . '/theme.xml', '<theme/>');
        $this->write($vue . '/theme.xml', '<theme><parent>OOCS/LynxBlank</parent></theme>');
        $this->write($vue . '/lynx/package.json', [
            'workspaces' => ['.lynx'],
            'dependencies' => ['@fontsource/mulish' => '5.3.0'],
            'devDependencies' => ['globals' => '17.13.0'],
        ]);

        $modules = [
            'OOCS_LynxTheme' => $this->root . '/packages/module-theme',
            'Vendor_Pay' => $this->root . '/packages/module-pay',
            'Vendor_NoClient' => $this->root . '/packages/module-no-client',
            'Vendor_Off' => $this->root . '/packages/module-off',
        ];
        $this->write($modules['OOCS_LynxTheme'] . '/view/frontend/lynx/vue/package.json', [
            'name' => '@oocs/module-lynx-theme',
            'dependencies' => ['vue' => '3.5.44'],
            'devDependencies' => ['vite' => '8.3.4', 'globals' => '17.13.0'],
        ]);
        $this->driver->createDirectory($modules['OOCS_LynxTheme'] . '/view/frontend/lynx/vue/src');
        $this->write($modules['Vendor_Pay'] . '/view/frontend/lynx/vue/package.json', [
            'dependencies' => ['vue' => '3.5.44', 'braintree-web' => '3.146.0'],
        ]);
        $this->driver->createDirectory($modules['Vendor_Pay'] . '/view/frontend/lynx/vue/src');
        $this->write($modules['Vendor_NoClient'] . '/etc/module.xml', '<config/>');
        $this->write($modules['Vendor_Off'] . '/view/frontend/lynx/vue/package.json', [
            'dependencies' => ['lodash' => '4.17.21'],
        ]);

        $registrar = $this->createMock(ComponentRegistrarInterface::class);
        $registrar->method('getPaths')->willReturnMap([
            [ComponentRegistrar::THEME, ['frontend/OOCS/LynxBlank' => $blank, 'frontend/OOCS/LynxVue' => $vue]],
            [ComponentRegistrar::MODULE, $modules],
        ]);
        $moduleList = $this->createMock(ModuleListInterface::class);
        $moduleList->method('getNames')->willReturn(['OOCS_LynxTheme', 'Vendor_Pay', 'Vendor_NoClient']);
        $directoryList = $this->createMock(DirectoryList::class);
        $directoryList->method('getRoot')->willReturn($this->root);

        $manifest = new BuildManifest($registrar, $moduleList, $directoryList, $this->driver, new Json());
        $this->dependencies = new ThemeDependencies($manifest, $this->driver, new Json());
    }

    /**
     * Remove the temporary project
     *
     * @return void
     */
    protected function tearDown(): void
    {
        $this->driver->deleteDirectory($this->root);
    }

    /**
     * The kit and the enabled modules, less the theme's own packages, plus the kit itself
     *
     * @return void
     */
    public function testGenerate(): void
    {
        $content = $this->dependencies->generate('frontend/OOCS/LynxVue');
        $meta = json_decode($content, true);

        $this->assertSame('lynx-deps', $meta['name']);
        $this->assertSame(
            [
                '@oocs/module-lynx-theme' => 'file:../../../module-theme/view/frontend/lynx/vue',
                'braintree-web' => '3.146.0',
                'vite' => '8.3.4',
                'vue' => '3.5.44',
            ],
            $meta['dependencies']
        );
        $this->assertSame(
            ['OOCS_LynxTheme' => '../../module-theme', 'Vendor_Pay' => '../../module-pay'],
            $meta['lynx']['modules']
        );
        $this->assertSame(['../../theme-blank'], $meta['lynx']['parents']);
        $this->assertSame($meta['version'], $this->dependencies->version($content));
        $this->assertSame(array_keys($meta['dependencies']), $this->dependencies->names($content));
        $this->assertStringStartsWith("{\n  \"name\"", $content);
    }

    /**
     * The version follows the package list
     *
     * @return void
     */
    public function testVersionFollowsPackages(): void
    {
        $before = $this->dependencies->version($this->dependencies->generate('frontend/OOCS/LynxVue'));
        $this->write($this->root . '/packages/module-pay/view/frontend/lynx/vue/package.json', [
            'dependencies' => ['braintree-web' => '3.147.0'],
        ]);

        $this->assertNotSame(
            $before,
            $this->dependencies->version($this->dependencies->generate('frontend/OOCS/LynxVue'))
        );
    }

    /**
     * The version follows the kit's commands too, which npm links only when it installs
     *
     * @return void
     */
    public function testVersionFollowsKitBin(): void
    {
        $before = $this->dependencies->version($this->dependencies->generate('frontend/OOCS/LynxVue'));
        $this->write($this->root . '/packages/module-theme/view/frontend/lynx/vue/package.json', [
            'name' => '@oocs/module-lynx-theme',
            'bin' => ['lynx-lint-vue' => './build/lint.mjs'],
            'dependencies' => ['vue' => '3.5.44'],
            'devDependencies' => ['vite' => '8.3.4', 'globals' => '17.13.0'],
        ]);

        $this->assertNotSame(
            $before,
            $this->dependencies->version($this->dependencies->generate('frontend/OOCS/LynxVue'))
        );
    }

    /**
     * The install key follows the theme's own packages, which the meta-package leaves out
     *
     * @return void
     */
    public function testInstallKeyFollowsOwnPackages(): void
    {
        $content = $this->dependencies->generate('frontend/OOCS/LynxVue');
        $before = $this->dependencies->installKey('frontend/OOCS/LynxVue', $content);
        $this->assertStringStartsWith($this->dependencies->version($content) . '-', $before);

        $this->write($this->root . '/packages/theme-vue/lynx/package.json', [
            'workspaces' => ['.lynx'],
            'dependencies' => ['@fontsource/mulish' => '5.3.0', 'chart.js' => '4.5.0'],
            'devDependencies' => ['globals' => '17.13.0'],
        ]);

        $this->assertSame($content, $this->dependencies->generate('frontend/OOCS/LynxVue'));
        $this->assertNotSame($before, $this->dependencies->installKey('frontend/OOCS/LynxVue', $content));
    }

    /**
     * A package two sources pin differently, the theme included, is refused with both named
     *
     * @return void
     */
    public function testConflict(): void
    {
        $this->write($this->root . '/packages/theme-vue/lynx/package.json', [
            'devDependencies' => ['vite' => '8.5.0'],
        ]);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('"vite" is 8.3.4 in OOCS_LynxTheme but 8.5.0 in');

        $this->dependencies->generate('frontend/OOCS/LynxVue');
    }

    /**
     * Write a file, a JSON value when given an array
     *
     * @param string $path
     * @param array|string $content
     * @return void
     */
    private function write(string $path, array|string $content): void
    {
        $this->driver->createDirectory(\dirname($path));
        $this->driver->filePutContents($path, \is_array($content) ? json_encode($content) : $content);
    }
}
