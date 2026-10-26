<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Test\Unit\Observer;

use Magento\Framework\App\ActionFlag;
use Magento\Framework\App\Request\Http as Request;
use Magento\Framework\App\Response\Http as Response;
use Magento\Framework\Event\Observer;
use OOCS\LynxTheme\Model\ThemeFallback;
use OOCS\LynxTheme\Observer\FallbackLocationVisit;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

/**
 * An Inertia visit to a fallback page gets 409 and the URL, so the browser loads it in full
 */
class FallbackLocationVisitTest extends TestCase
{
    /**
     * @var Response&MockObject
     */
    private Response $response;

    /**
     * Run the observer for a request and fallback state
     *
     * @param mixed $inertia
     * @param bool $get
     * @param bool $active
     * @param bool $matches
     * @return void
     */
    private function visit(mixed $inertia, bool $get, bool $active, bool $matches): void
    {
        $request = $this->createMock(Request::class);
        $request->method('getHeader')->with('X-Inertia')->willReturn($inertia);
        $request->method('isGet')->willReturn($get);
        $request->method('getFullActionName')->willReturn('multishipping_checkout_index');
        $request->method('getUriString')->willReturn('https://shop.test/multishipping/checkout/');
        $fallback = $this->createMock(ThemeFallback::class);
        $fallback->method('isActive')->willReturn($active);
        $fallback->method('matches')->willReturn($matches);

        (new FallbackLocationVisit($request, $this->response, $this->createMock(ActionFlag::class), $fallback))
            ->execute(new Observer());
    }

    /**
     * A fresh response mock
     *
     * @return void
     */
    protected function setUp(): void
    {
        $this->response = $this->createMock(Response::class);
    }

    /**
     * Inertia GET to a fallback page: 409 with the location
     *
     * @return void
     */
    public function testAnswered409(): void
    {
        $this->response->expects($this->once())->method('setHttpResponseCode')->with(409);
        $this->response->expects($this->once())->method('setHeader')
            ->with('X-Inertia-Location', 'https://shop.test/multishipping/checkout/', true);

        $this->visit('true', true, true, true);
    }

    /**
     * Anything else goes through
     *
     * @return void
     */
    public function testOthersUntouched(): void
    {
        $this->response->expects($this->never())->method('setHttpResponseCode');

        $this->visit(false, true, true, true);
        $this->visit('true', false, true, true);
        $this->visit('true', true, false, true);
        $this->visit('true', true, true, false);
    }
}
